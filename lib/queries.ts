import { sql, eq, desc, and } from "drizzle-orm";
import {
  alignments,
  aamcCompetencies,
  aamcKeywords,
  chunkMedia,
  chunks,
  courseObjectives,
  courses,
  documents,
  gapSummary,
  keywordTags,
  mediaAssets,
  usmleDomains,
} from "@/drizzle/schema";
import { getDb } from "@/lib/db";
import {
  courseTargetSystems,
  systemOfLabel,
  courseModule,
} from "@/lib/course-scope";
import { distribution, type CoverageDist } from "@/lib/coverage";
import { passesSimilarity, resolveMinSimilarity } from "@/lib/retrieval-config";

export async function getCourseWithDocuments(courseId: number) {
  const db = getDb();
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId));
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.courseId, courseId))
    .orderBy(documents.caseNumber);
  return { course, documents: docs };
}

/**
 * Roll a set of per-subdomain USMLE coverage statuses up to a single
 * system-level status for the heatmap. Fully covered → covered; no coverage at
 * all → gap; anything in between → partial. Pure + exported for testing.
 */
export function rollUpCoverageStatus(
  covered: number,
  partial: number,
  total: number,
): "covered" | "partial" | "gap" {
  if (total <= 0) return "gap";
  if (covered >= total) return "covered";
  if (covered === 0 && partial === 0) return "gap";
  return "partial";
}

/** Human-readable USMLE system name from a gap-summary label ("System — sub")
 * with a slug fallback ("cardiovascular-system" → "Cardiovascular System"). */
export function deriveUsmleSystem(sampleLabel: string, slug: string): string {
  const fromLabel = (sampleLabel || "").split(" — ")[0]?.trim();
  if (fromLabel) return fromLabel;
  return (slug || "Other")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getCourseSummary(courseId: number) {
  const db = getDb();
  const { course, documents: docs } = await getCourseWithDocuments(courseId);
  if (!course) return null;

  // Organ-system scope: an organ course (e.g. RMD 563, GI/metabolism) is only
  // meant to cover its own systems, so coverage/gaps/heatmap are measured
  // against those — everything else is "not in scope", not a gap. null = all.
  const targetSystems = courseTargetSystems(course.code);
  const inScope = (system: string) => !targetSystems || targetSystems.includes(system);

  const gapRows = await db
    .select()
    .from(gapSummary)
    .innerJoin(documents, eq(documents.id, gapSummary.documentId))
    .where(eq(documents.courseId, courseId));

  const gaps = gapRows.filter(
    (g) =>
      g.gap_summary.coverageStatus === "gap" ||
      g.gap_summary.coverageStatus === "partial",
  );

  const alignmentStats = await db.execute(sql`
    SELECT AVG(a.confidence::numeric) as avg_confidence,
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE a.status IN ('approved','rejected'))::int as reviewed
    FROM alignments a
    JOIN chunks c ON c.id = a.chunk_id
    JOIN documents d ON d.id = c.document_id
    WHERE d.course_id = ${courseId}
  `);
  const stats = alignmentStats.rows[0] as {
    avg_confidence: string | null;
    total: number;
    reviewed: number;
  };

  const aamcCoverage = await db.execute(sql`
    SELECT ac.domain_name,
           COUNT(DISTINCT ac.stable_id)::int as total,
           COUNT(DISTINCT ac.stable_id) FILTER (WHERE a.id IS NOT NULL)::int as covered
    FROM aamc_competencies ac
    LEFT JOIN alignments a ON (
      (a.framework_id = ac.stable_id OR a.framework_id = ac.sub_id)
      AND a.framework IN ('AAMC_PCRS','AAMC_EPA')
      AND EXISTS (
        SELECT 1 FROM chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE c.id = a.chunk_id AND d.course_id = ${courseId}
      )
    )
    GROUP BY ac.domain_name
  `);

  // Roll granular USMLE subdomain gap rows up to their organ system, per case,
  // so the heatmap axis is the real systems present in the curriculum.
  const heatmap = await db.execute(sql`
    SELECT d.case_number,
           split_part(gs.framework_id, ':', 2) AS system_slug,
           MIN(gs.framework_label) AS sample_label,
           COUNT(*) FILTER (WHERE gs.coverage_status = 'covered')::int AS covered,
           COUNT(*) FILTER (WHERE gs.coverage_status = 'partial')::int AS partial_ct,
           COUNT(*)::int AS total
    FROM gap_summary gs
    JOIN documents d ON d.id = gs.document_id
    WHERE d.course_id = ${courseId} AND gs.framework = 'USMLE'
    GROUP BY d.case_number, split_part(gs.framework_id, ':', 2)
  `);

  const recentAlignments = await db
    .select({
      id: alignments.id,
      framework: alignments.framework,
      frameworkId: alignments.frameworkId,
      frameworkLabel: alignments.frameworkLabel,
      confidence: alignments.confidence,
      status: alignments.status,
      rationale: alignments.rationale,
      excerpt: sql<string>`LEFT(${chunks.content}, 120)`,
      section: chunks.section,
      filename: documents.filename,
    })
    .from(alignments)
    .innerJoin(chunks, eq(chunks.id, alignments.chunkId))
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(eq(documents.courseId, courseId))
    .orderBy(desc(alignments.createdAt))
    .limit(10);

  const totalUsmleLeaf = await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM usmle_domains WHERE parent_stable_id IS NOT NULL
  `);
  const totalUsmleLeafCount = Number(
    (totalUsmleLeaf.rows[0] as { cnt: number })?.cnt ?? 0,
  );
  const alignedUsmle = await db.execute(sql`
    SELECT COUNT(DISTINCT a.framework_id)::int as cnt
    FROM alignments a
    JOIN chunks c ON c.id = a.chunk_id
    JOIN documents d ON d.id = c.document_id
    WHERE d.course_id = ${courseId} AND a.framework = 'USMLE'
  `);
  const usmleAlignedCount = Number(
    (alignedUsmle.rows[0] as { cnt: number })?.cnt ?? 0,
  );

  // Scope the "X of Y USMLE domains" totals to the target systems when curated.
  let usmleTotal = totalUsmleLeafCount;
  let usmleCovered = usmleAlignedCount;
  if (targetSystems) {
    const sysList = sql.join(
      targetSystems.map((s) => sql`${s}`),
      sql`, `,
    );
    const t = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM usmle_domains
      WHERE parent_stable_id IS NOT NULL AND domain IN (${sysList})
    `);
    usmleTotal = Number((t.rows[0] as { cnt: number })?.cnt ?? 0);
    const cov = await db.execute(sql`
      SELECT COUNT(DISTINCT a.framework_id)::int AS cnt
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE d.course_id = ${courseId} AND a.framework = 'USMLE'
        AND split_part(a.framework_label, ' — ', 1) IN (${sysList})
    `);
    usmleCovered = Number((cov.rows[0] as { cnt: number })?.cnt ?? 0);
  }

  const aamcAligned = await db.execute(sql`
    SELECT COUNT(DISTINCT ac.stable_id)::int as cnt
    FROM aamc_competencies ac
    INNER JOIN alignments a ON a.framework_id = ac.stable_id OR a.framework_id = ac.sub_id
    INNER JOIN chunks c ON c.id = a.chunk_id
    INNER JOIN documents d ON d.id = c.document_id
    WHERE d.course_id = ${courseId}
  `);
  const aamcTotal = await db.select().from(aamcCompetencies);
  const aamcAlignedCount = Number(
    (aamcAligned.rows[0] as { cnt: number })?.cnt ?? 0,
  );
  const aamcPct =
    aamcTotal.length > 0
      ? Math.round((aamcAlignedCount / aamcTotal.length) * 100)
      : 0;

  const heatmapData = (heatmap.rows as Record<string, unknown>[]).map((r) => ({
    caseNumber: Number(r.case_number),
    system: deriveUsmleSystem(String(r.sample_label ?? ""), String(r.system_slug ?? "")),
    status: rollUpCoverageStatus(
      Number(r.covered ?? 0),
      Number(r.partial_ct ?? 0),
      Number(r.total ?? 0),
    ),
  }));
  const allSystems = Array.from(new Set(heatmapData.map((h) => h.system))).sort();
  // Scope the heatmap rows + axis to the course's target systems (all if none).
  const scopedHeatmap = heatmapData.filter((h) => inScope(h.system));
  const usmleSystems = targetSystems
    ? targetSystems.filter((s) => allSystems.includes(s))
    : allSystems;

  // In-scope gaps = target-system leaf domains with no alignment. Derived from
  // the leaf totals (not the capped gap_summary snapshot, which undercounts).
  // Unscoped courses keep the original gap_summary-based count.
  const scopedUsmleGaps = targetSystems
    ? Math.max(0, usmleTotal - usmleCovered)
    : gaps.filter((g) => g.gap_summary.coverageStatus === "gap").length;

  return {
    course,
    documents: docs,
    targetSystems,
    metrics: {
      aamcCoveragePercent: aamcPct,
      usmleGaps: scopedUsmleGaps,
      avgConfidence: Number(stats?.avg_confidence ?? 0),
      guidesProcessed: docs.length,
      usmleDomainsCovered: usmleCovered,
      usmleDomainsTotal: usmleTotal || 1,
      alignmentsReviewed: Number(stats?.reviewed ?? 0),
      alignmentsTotal: Number(stats?.total ?? 0),
    },
    aamcDomainCoverage: (aamcCoverage.rows as { domain_name: string; total: number; covered: number }[]).map(
      (r) => ({
        domain: r.domain_name,
        count: r.covered,
        percent: r.total > 0 ? Math.round((r.covered / r.total) * 100) : 0,
      }),
    ),
    heatmap: scopedHeatmap,
    usmleSystems,
    // Out-of-scope USMLE systems aren't gaps for this course; keep all AAMC rows.
    gaps: gaps
      .filter(
        (g) =>
          g.gap_summary.framework !== "USMLE" ||
          inScope(systemOfLabel(g.gap_summary.frameworkLabel)),
      )
      .map((g) => g.gap_summary),
    recentAlignments,
    coveredDomains: usmleCovered,
  };
}

/** Group per-chunk keyword-tag rows into a chunkId → tags map, dropping empty
 * keywords and deduping repeats per chunk. Pure + exported for testing. */
export function groupKeywordsByChunk(
  rows: { chunkId: number | null; keyword: string | null; definition: string | null }[],
): Record<number, { keyword: string; definition: string | null }[]> {
  const byChunk: Record<number, { keyword: string; definition: string | null }[]> = {};
  for (const row of rows) {
    if (row.chunkId == null || !row.keyword) continue;
    const list = byChunk[row.chunkId] ?? [];
    if (!list.some((k) => k.keyword === row.keyword)) {
      list.push({ keyword: row.keyword, definition: row.definition ?? null });
    }
    byChunk[row.chunkId] = list;
  }
  return byChunk;
}

/**
 * Program-wide ("full curriculum") coverage across ALL courses, measured against
 * the WHOLE framework — the inverse of getCourseSummary's organ scoping. Here the
 * full USMLE content outline (every leaf domain / all 15 systems) and all AAMC
 * competencies are the denominator, because collectively the curriculum should
 * cover everything, so an uncovered domain is a real program gap. Coverage is the
 * union across courses (a domain is covered if ANY course covers it).
 */
export async function getProgramSummary() {
  const db = getDb();

  const courseRows = await db
    .select({ id: courses.id, code: courses.code, title: courses.title })
    .from(courses)
    .orderBy(courses.id);
  const courseList = courseRows.map((c) => ({ ...c, module: courseModule(c.code) }));
  const moduleByCourse = new Map(courseList.map((c) => [c.id, c.module]));
  const modules = Array.from(new Set(courseList.map((c) => c.module))).sort();

  const counts = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM documents) AS documents,
      (SELECT COUNT(*)::int FROM alignments) AS alignments,
      (SELECT COUNT(*)::int FROM usmle_domains WHERE parent_stable_id IS NOT NULL) AS usmle_total,
      (SELECT COUNT(*)::int FROM aamc_competencies) AS aamc_total
  `);
  const c0 = counts.rows[0] as {
    documents: number; alignments: number; usmle_total: number; aamc_total: number;
  };

  // Per (framework, topic, course): distinct DOCUMENTS (the "places" for the
  // Introduced -> Reinforced -> Mastered model) + chunks. Rolling up by course
  // lets us report coverage program-wide AND per module, for BOTH frameworks.
  const rows = (
    await db.execute(sql`
      SELECT
        CASE WHEN a.framework = 'USMLE' THEN 'usmle' ELSE 'aamc' END AS fw,
        a.framework_id AS id,
        MIN(a.framework_label) AS label,
        split_part(MIN(a.framework_label), ' — ', 1) AS system,
        d.course_id AS course_id,
        COUNT(DISTINCT c.document_id)::int AS docs,
        COUNT(DISTINCT a.chunk_id)::int AS chunks
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE a.framework IN ('USMLE','AAMC_PCRS','AAMC_EPA')
      GROUP BY fw, a.framework_id, d.course_id
    `)
  ).rows as {
    fw: "usmle" | "aamc"; id: string; label: string; system: string;
    course_id: number; docs: number; chunks: number;
  }[];

  type Topic = { docs: number; chunks: number; courses: Set<number>; label: string; system: string };

  // Roll the per-(topic,course) rows up to per-topic totals within a course scope
  // (all courses, or one module's courses), for one framework.
  function topicsInScope(fw: "usmle" | "aamc", inScope: (courseId: number) => boolean) {
    const map = new Map<string, Topic>();
    for (const r of rows) {
      if (r.fw !== fw || !inScope(r.course_id)) continue;
      const e = map.get(r.id) ?? { docs: 0, chunks: 0, courses: new Set<number>(), label: r.label, system: r.system };
      e.docs += r.docs;
      e.chunks += r.chunks;
      e.courses.add(r.course_id);
      map.set(r.id, e);
    }
    return map;
  }

  // Distribution over a topic set via the canonical engine (lib/coverage) — the
  // single source of level thresholds/definitions (R7).
  const distFor = (topics: Map<string, Topic>, total: number): CoverageDist =>
    distribution(
      Array.from(topics.values()).map((t) => t.docs),
      total,
    );

  // Scopes: entire curriculum, then each module (M1, M2, ...).
  const scopeDefs: { key: string; inScope: (id: number) => boolean }[] = [
    { key: "Entire curriculum", inScope: () => true },
    ...modules.map((m) => ({ key: m, inScope: (id: number) => moduleByCourse.get(id) === m })),
  ];

  const byScope = (fw: "usmle" | "aamc", total: number): Record<string, CoverageDist> =>
    Object.fromEntries(
      scopeDefs.map((s) => [s.key, distFor(topicsInScope(fw, s.inScope), total)]),
    );

  // USMLE per-organ-system breakdown + redundancy, at the entire-curriculum scope.
  const sysTotalsRes = await db.execute(sql`
    SELECT domain AS system, COUNT(*)::int AS total
    FROM usmle_domains WHERE parent_stable_id IS NOT NULL GROUP BY domain
  `);
  const totalBySystem = new Map<string, number>();
  for (const r of sysTotalsRes.rows as { system: string; total: number }[]) {
    totalBySystem.set(r.system, r.total);
  }
  const usmleTopics = topicsInScope("usmle", () => true);
  const docsBySystem = new Map<string, number[]>();
  for (const s of Array.from(totalBySystem.keys())) docsBySystem.set(s, []);
  for (const e of Array.from(usmleTopics.values())) docsBySystem.get(e.system)?.push(e.docs);
  // Each system carries a full CoverageDist (from the same engine).
  const systems = Array.from(totalBySystem.keys())
    .sort()
    .map((system) => ({
      system,
      ...distribution(docsBySystem.get(system) ?? [], totalBySystem.get(system) ?? 0),
    }));
  const mostCovered = Array.from(usmleTopics.values())
    .sort((a, b) => b.docs - a.docs || b.chunks - a.chunks)
    .slice(0, 8)
    .map((e) => ({ label: e.label, system: e.system, docs: e.docs, courses: e.courses.size, chunks: e.chunks }));

  return {
    courses: courseList,
    modules,
    scopes: scopeDefs.map((s) => s.key),
    metrics: {
      courses: courseList.length,
      documents: c0.documents,
      alignments: c0.alignments,
    },
    usmle: { total: c0.usmle_total, byScope: byScope("usmle", c0.usmle_total) },
    aamc: { total: c0.aamc_total, byScope: byScope("aamc", c0.aamc_total) },
    systems,
    mostCovered,
  };
}

export async function getMapData(courseId: number) {
  const db = getDb();
  // Only the columns the map renders — not sourcePath/filename (server-side
  // locators the client shouldn't see, mirroring how storage_path is hidden).
  const docs = await db
    .select({
      id: documents.id,
      caseNumber: documents.caseNumber,
      caseTitle: documents.caseTitle,
    })
    .from(documents)
    .where(eq(documents.courseId, courseId))
    .orderBy(documents.caseNumber);

  // Select only the columns the map/drawer render — never the 1536-float
  // embedding vector (it dwarfs everything and the client never uses it).
  const chunkRows = await db
    .select({
      chunk: {
        id: chunks.id,
        section: chunks.section,
        content: chunks.content,
      },
      document: {
        caseNumber: documents.caseNumber,
        caseTitle: documents.caseTitle,
      },
    })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(eq(documents.courseId, courseId))
    .orderBy(documents.caseNumber, chunks.chunkIndex);

  const alignmentRows = await db
    .select({
      alignment: alignments,
      chunkId: chunks.id,
    })
    .from(alignments)
    .innerJoin(chunks, eq(chunks.id, alignments.chunkId))
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(eq(documents.courseId, courseId));

  const mediaLinkRows = await db
    .select({
      chunkId: chunkMedia.chunkId,
      mediaAssetId: chunkMedia.mediaAssetId,
      asset: mediaAssets,
    })
    .from(chunkMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, chunkMedia.mediaAssetId))
    .innerJoin(chunks, eq(chunks.id, chunkMedia.chunkId))
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(eq(documents.courseId, courseId));

  const mediaByChunkId: Record<
    number,
    {
      id: number;
      label: string;
      textForEmbed: string | null;
      hasFile: boolean;
      hasCaptionInText: boolean | null;
      referenceKind: string;
    }[]
  > = {};

  for (const row of mediaLinkRows) {
    const list = mediaByChunkId[row.chunkId] ?? [];
    list.push({
      id: row.asset.id,
      label: row.asset.label,
      textForEmbed: row.asset.textForEmbed,
      // Never expose the raw storage_path — it's a filesystem/Blob locator
      // key, not client-facing data; the client only ever needs to know
      // whether /api/media/{id} will actually return bytes.
      hasFile: Boolean(row.asset.storagePath),
      hasCaptionInText: row.asset.hasCaptionInText,
      referenceKind: row.asset.referenceKind,
    });
    mediaByChunkId[row.chunkId] = list;
  }

  // Per-chunk AAMC keyword tags (what topics the chunk actually covers), joined
  // to aamc_keywords for the definition shown on hover.
  const keywordRows = await db
    .select({
      chunkId: keywordTags.chunkId,
      keyword: keywordTags.keyword,
      definition: aamcKeywords.definition,
    })
    .from(keywordTags)
    .innerJoin(chunks, eq(chunks.id, keywordTags.chunkId))
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .leftJoin(aamcKeywords, eq(aamcKeywords.stableId, keywordTags.category))
    .where(eq(documents.courseId, courseId));

  const keywordsByChunkId = groupKeywordsByChunk(keywordRows);

  // Framework trees need display columns + stableId (the id alignments key on,
  // so a node can be matched/highlighted against the alignments that hit it) —
  // never the embeddings. usmle is restricted to leaf domains (the alignable
  // level) to drop parent rows from the tree.
  const aamc = await db
    .select({
      stableId: aamcCompetencies.stableId,
      subId: aamcCompetencies.subId,
      domainName: aamcCompetencies.domainName,
      description: aamcCompetencies.description,
    })
    .from(aamcCompetencies);
  const usmle = await db
    .select({
      stableId: usmleDomains.stableId,
      domain: usmleDomains.domain,
      subdomain: usmleDomains.subdomain,
    })
    .from(usmleDomains)
    .where(sql`${usmleDomains.parentStableId} IS NOT NULL`);

  return { documents: docs, chunks: chunkRows, alignments: alignmentRows, mediaByChunkId, keywordsByChunkId, aamc, usmle };
}

export async function searchChunks(courseId: number, queryEmbedding: number[], limit = 5) {
  const db = getDb();
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  const result = await db.execute(sql`
    SELECT c.*, d.filename, d.case_title,
           1 - (c.embedding <=> ${vectorStr}::vector) AS similarity
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE d.course_id = ${courseId} AND c.embedding IS NOT NULL
    ORDER BY similarity DESC
    LIMIT ${limit}
  `);
  const rows = result.rows as Record<string, unknown>[];

  // Relevance floor (default off). When set, keep only results that clear it;
  // if none clear it, fall back to the single best hit so the caller can surface
  // a low-confidence answer rather than an empty result.
  const minSimilarity = resolveMinSimilarity();
  if (minSimilarity === null) return rows;
  const passing = rows.filter((r) => passesSimilarity(Number(r.similarity), minSimilarity));
  return passing.length ? passing : rows.slice(0, 1);
}

export async function getGapExportRows(courseId: number) {
  const db = getDb();
  return db
    .select({
      framework: gapSummary.framework,
      frameworkId: gapSummary.frameworkId,
      frameworkLabel: gapSummary.frameworkLabel,
      coverageStatus: gapSummary.coverageStatus,
      chunkCount: gapSummary.chunkCount,
      avgConfidence: gapSummary.avgConfidence,
      caseTitle: documents.caseTitle,
    })
    .from(gapSummary)
    .innerJoin(documents, eq(documents.id, gapSummary.documentId))
    .where(eq(documents.courseId, courseId));
}

export async function getCourseObjectives(courseId: number) {
  const db = getDb();
  return db
    .select({
      objective: courseObjectives,
      document: documents,
    })
    .from(courseObjectives)
    .innerJoin(documents, eq(documents.id, courseObjectives.documentId))
    .where(eq(documents.courseId, courseId))
    .orderBy(documents.caseNumber, courseObjectives.ordinal);
}

export async function getCourseObjectivesSummary(courseId: number) {
  const rows = await getCourseObjectives(courseId);
  const byCase = new Map<
    number,
    { caseNumber: number; caseTitle: string | null; count: number }
  >();
  let regexCount = 0;
  let llmCount = 0;

  for (const row of rows) {
    const caseNum = row.document.caseNumber ?? 0;
    const existing = byCase.get(caseNum) ?? {
      caseNumber: caseNum,
      caseTitle: row.document.caseTitle,
      count: 0,
    };
    existing.count++;
    byCase.set(caseNum, existing);
    if (row.objective.extractionMethod === "llm_cleanup") llmCount++;
    else regexCount++;
  }

  return {
    total: rows.length,
    regexCount,
    llmCount,
    byCase: Array.from(byCase.values()).sort((a, b) => a.caseNumber - b.caseNumber),
    rows,
  };
}
