import { sql, eq, desc, and, inArray, notInArray } from "drizzle-orm";
import {
  alignments,
  aamcCompetencies,
  aamcKeywords,
  chunkMedia,
  chunks,
  courseObjectives,
  courses,
  documents,
  figureCaptions,
  keywordTags,
  mediaAssets,
  usmleDomains,
} from "@/drizzle/schema";
import { getDb } from "@/lib/db";
import {
  courseTargetSystems,
  courseModule,
  courseCodesForModule,
  curatedCourseCodesWithModule,
} from "@/lib/course-scope";
import { distribution, heatmapCellStatus, type CoverageDist } from "@/lib/coverage";
import { type CoverageExportRow } from "@/lib/coverage-export";
import {
  sortObjectivesExportRows,
  type ObjectivesExportRow,
} from "@/lib/objectives-export";
import { passesSimilarity, resolveMinSimilarity } from "@/lib/retrieval-config";
import { inferGuideKind } from "@/lib/media-types";

/**
 * Map raw (case, system, domains_touched) rows to heatmap cells via
 * heatmapCellStatus (KTD1). Pure and exported for testing — this is the seam
 * that guards AE1 (no PR #8 all-red regression): a `system` string from the
 * query that doesn't match a key in `domainsTotalBySystem` (e.g. a catalog
 * join miss) resolves to a 0 total, and heatmapCellStatus always returns
 * "gap" for a 0 total regardless of how many domains were actually touched.
 */
export function buildCourseHeatmap(
  rows: { case_number: number; system: string; domains_touched: number }[],
  domainsTotalBySystem: Map<string, number>,
): { caseNumber: number; system: string; status: ReturnType<typeof heatmapCellStatus> }[] {
  return rows.map((r) => ({
    caseNumber: Number(r.case_number),
    system: r.system,
    status: heatmapCellStatus(r.domains_touched, domainsTotalBySystem.get(r.system) ?? 0),
  }));
}

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

export async function getCourseSummary(courseId: number) {
  const db = getDb();
  const { course, documents: docs } = await getCourseWithDocuments(courseId);
  if (!course) return null;

  // Organ-system scope: an organ course (e.g. RMD 563, GI/metabolism) is only
  // meant to cover its own systems, so coverage/gaps/heatmap are measured
  // against those — everything else is "not in scope", not a gap. null = all.
  const targetSystems = courseTargetSystems(course.code);
  const inScope = (system: string) => !targetSystems || targetSystems.includes(system);

  // All of the following are independent of each other — each depends only
  // on courseId/targetSystems (already resolved above), never on another
  // query's result — so they run as one parallel batch instead of ~12
  // sequential round trips (a known/deferred perf item).
  const sysList = targetSystems ? sql.join(targetSystems.map((s) => sql`${s}`), sql`, `) : null;
  const [
    alignmentStats,
    aamcCoverage,
    heatmapTouched,
    systemTotalsRes,
    recentAlignments,
    totalUsmleLeaf,
    usmleDocRows,
    usmleTotalRes,
    aamcAligned,
    aamcTotal,
    aamcDocRows,
    topicRows,
  ] = await Promise.all([
    db.execute(sql`
      SELECT AVG(a.confidence::numeric) as avg_confidence,
             COUNT(*)::int as total,
             COUNT(*) FILTER (WHERE a.status IN ('approved','rejected'))::int as reviewed
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE d.course_id = ${courseId}
    `),
    db.execute(sql`
      SELECT ac.domain_name,
             COUNT(DISTINCT ac.stable_id)::int as total,
             COUNT(DISTINCT ac.stable_id) FILTER (WHERE a.id IS NOT NULL)::int as covered
      FROM aamc_competencies ac
      LEFT JOIN alignments a ON (
        a.framework_id = ac.stable_id
        AND a.framework IN ('AAMC_PCRS','AAMC_EPA')
        AND EXISTS (
          SELECT 1 FROM chunks c
          JOIN documents d ON d.id = c.document_id
          WHERE c.id = a.chunk_id AND d.course_id = ${courseId}
        )
      )
      GROUP BY ac.domain_name
    `),
    // Per-(case, system) breadth: how many distinct USMLE leaf domains in each
    // system did each session's document touch. A different question than the
    // course-wide, per-topic document-count engine below — heatmapCellStatus
    // (KTD1) buckets it independently, not tuned to any particular visual
    // result. Inner query resolves one system per framework_id; outer GROUP
    // BY does the distinct-domain rollup in SQL rather than a hand-rolled JS
    // Map/Set.
    db.execute(sql`
      SELECT sub.case_number, sub.system, COUNT(DISTINCT sub.id)::int AS domains_touched
      FROM (
        SELECT d.case_number,
               a.framework_id AS id,
               COALESCE(MIN(ud.domain), split_part(MIN(a.framework_label), ' — ', 1)) AS system
        FROM alignments a
        JOIN chunks c ON c.id = a.chunk_id
        JOIN documents d ON d.id = c.document_id
        LEFT JOIN usmle_domains ud ON ud.stable_id = a.framework_id
        WHERE d.course_id = ${courseId} AND a.framework = 'USMLE' AND d.case_number IS NOT NULL
        GROUP BY d.case_number, a.framework_id
      ) sub
      GROUP BY sub.case_number, sub.system
    `),
    db.execute(sql`
      SELECT domain AS system, COUNT(*)::int AS total
      FROM usmle_domains WHERE parent_stable_id IS NOT NULL GROUP BY domain
    `),
    db
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
      .limit(10),
    db.execute(sql`
      SELECT COUNT(*)::int as cnt FROM usmle_domains WHERE parent_stable_id IS NOT NULL
    `),
    // Distinct documents per addressed USMLE domain (organ-scoped when
    // curated). Drives BOTH the covered count and the intensity spectrum —
    // computed once, so the covered count is just the number of addressed
    // domains (rows).
    db.execute(sql`
      SELECT COUNT(DISTINCT c.document_id)::int AS docs
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      ${targetSystems ? sql`JOIN usmle_domains ud ON ud.stable_id = a.framework_id` : sql``}
      WHERE d.course_id = ${courseId} AND a.framework = 'USMLE'
        ${sysList ? sql`AND ud.domain IN (${sysList})` : sql``}
      GROUP BY a.framework_id
    `),
    // Scope the "X of Y USMLE domains" denominator to the target systems when
    // curated (the covered count already respects scope via usmleDocRows).
    sysList
      ? db.execute(sql`
          SELECT COUNT(*)::int AS cnt FROM usmle_domains
          WHERE parent_stable_id IS NOT NULL AND domain IN (${sysList})
        `)
      : Promise.resolve(null),
    db.execute(sql`
      SELECT COUNT(DISTINCT ac.stable_id)::int as cnt
      FROM aamc_competencies ac
      INNER JOIN alignments a ON a.framework_id = ac.stable_id
      INNER JOIN chunks c ON c.id = a.chunk_id
      INNER JOIN documents d ON d.id = c.document_id
      WHERE d.course_id = ${courseId}
    `),
    db.select().from(aamcCompetencies),
    db.execute(sql`
      SELECT COUNT(DISTINCT c.document_id)::int AS docs
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE d.course_id = ${courseId} AND a.framework IN ('AAMC_PCRS','AAMC_EPA')
      GROUP BY a.framework_id
    `),
    // Same per-topic rows the course CSV export serializes (KTD3) — one
    // source, no second query path to diverge from it. targetSystems is
    // passed through since it's already resolved above — skips
    // getGapExportRows' own course/documents fetch when called from here.
    getGapExportRows(courseId, targetSystems),
  ]);

  const stats = alignmentStats.rows[0] as {
    avg_confidence: string | null;
    total: number;
    reviewed: number;
  };

  const domainsTotalBySystem = new Map<string, number>();
  for (const r of systemTotalsRes.rows as { system: string; total: number }[]) {
    domainsTotalBySystem.set(r.system, r.total);
  }

  const totalUsmleLeafCount = Number(
    (totalUsmleLeaf.rows[0] as { cnt: number })?.cnt ?? 0,
  );
  const usmleCoveredDocs = (usmleDocRows.rows as { docs: number }[]).map((r) => r.docs);
  const usmleCovered = usmleCoveredDocs.length;

  const usmleTotal = usmleTotalRes
    ? Number((usmleTotalRes.rows[0] as { cnt: number })?.cnt ?? 0)
    : totalUsmleLeafCount;

  const aamcAlignedCount = Number(
    (aamcAligned.rows[0] as { cnt: number })?.cnt ?? 0,
  );
  const aamcPct =
    aamcTotal.length > 0
      ? Math.round((aamcAlignedCount / aamcTotal.length) * 100)
      : 0;

  // Bucket each (case, system) cell deterministically (KTD1) — the distinct-
  // domain rollup itself already happened in SQL above.
  const heatmapData = buildCourseHeatmap(
    heatmapTouched.rows as { case_number: number; system: string; domains_touched: number }[],
    domainsTotalBySystem,
  );
  // The axis is every canonical system (domainsTotalBySystem, unconditional
  // on touched data) — not just systems this course happened to touch. A
  // target system with zero alignments must still appear as an all-gap row,
  // not vanish from the axis entirely (that would silently hide a real gap,
  // the opposite of what AE1 guards against).
  const allSystems = Array.from(domainsTotalBySystem.keys()).sort();
  // Scope the heatmap rows + axis to the course's target systems (all if none).
  const scopedHeatmap = heatmapData.filter((h) => inScope(h.system));
  const usmleSystems = targetSystems
    ? targetSystems.filter((s) => allSystems.includes(s))
    : allSystems;

  // usmleTotal/usmleCovered already come from the document-count engine above
  // (no gap_summary dependence), so this formula holds for curated and
  // uncurated courses alike — no separate fallback branch needed.
  const scopedUsmleGaps = Math.max(0, usmleTotal - usmleCovered);

  // Intensity spectrum from the same per-domain doc counts (organ-scoped USMLE,
  // computed once above), plus all-AAMC (cross-cutting).
  const usmleSpectrum = distribution(usmleCoveredDocs, usmleTotal || 1);
  const aamcSpectrum = distribution(
    (aamcDocRows.rows as { docs: number }[]).map((r) => r.docs),
    aamcTotal.length || 1,
  );

  return {
    course,
    documents: docs,
    targetSystems,
    usmleSpectrum,
    aamcSpectrum,
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
    // Full per-topic catalog rows (KTD3) — the gaps page derives both its gap
    // cards (docs < 2) and its full Coverage Table from this one array.
    topicRows,
    recentAlignments,
  };
}

/** Key a figure_captions or media_assets row by (filename, label) — the same
 * key scripts/import-figure-captions.ts upserts on. Pure + exported for testing. */
export function captionKey(filename: string, label: string): string {
  return `${filename}::${label}`;
}

/** Build a filename+label → official caption text lookup from figure_captions
 * rows. Pure + exported for testing. */
export function buildCaptionByKey(
  rows: { filename: string; label: string; textForEmbed: string }[],
): Map<string, string> {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    byKey.set(captionKey(row.filename, row.label), row.textForEmbed);
  }
  return byKey;
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
      (SELECT COUNT(*)::int FROM usmle_domains WHERE parent_stable_id IS NOT NULL) AS usmle_total,
      (SELECT COUNT(*)::int FROM aamc_competencies) AS aamc_total
  `);
  const c0 = counts.rows[0] as {
    documents: number; usmle_total: number; aamc_total: number;
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
        -- Canonical system from the catalog (usmle_domains) for USMLE; fall back to
        -- the label prefix only for AAMC, which has no organ system. Never key a
        -- rollup on the LLM-written label (deterministic-first doctrine).
        COALESCE(MIN(ud.domain), split_part(MIN(a.framework_label), ' — ', 1)) AS system,
        d.course_id AS course_id,
        COUNT(DISTINCT c.document_id)::int AS docs,
        COUNT(DISTINCT a.chunk_id)::int AS chunks
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      LEFT JOIN usmle_domains ud ON ud.stable_id = a.framework_id
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
  const topEntries = Array.from(usmleTopics.entries())
    .sort(([, a], [, b]) => b.docs - a.docs || b.chunks - a.chunks)
    .slice(0, 8);
  // Learning spiral: the ordered sequence of sessions (cases) that address each
  // top topic — how a topic is introduced then reinforced across the curriculum.
  const spiralByTopic = new Map<string, number[]>();
  if (topEntries.length > 0) {
    const ids = sql.join(topEntries.map(([id]) => sql`${id}`), sql`, `);
    const seqRes = await db.execute(sql`
      SELECT a.framework_id AS id, d.case_number AS casenum
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE a.framework = 'USMLE' AND a.framework_id IN (${ids}) AND d.case_number IS NOT NULL
      GROUP BY a.framework_id, d.case_number
      ORDER BY a.framework_id, d.case_number
    `);
    for (const r of seqRes.rows as { id: string; casenum: number }[]) {
      const arr = spiralByTopic.get(r.id) ?? [];
      arr.push(r.casenum);
      spiralByTopic.set(r.id, arr);
    }
  }
  const mostCovered = topEntries.map(([id, e]) => ({
    label: e.label,
    docs: e.docs,
    courses: e.courses.size,
    chunks: e.chunks,
    sessions: spiralByTopic.get(id) ?? [],
  }));

  return {
    scopes: scopeDefs.map((s) => s.key),
    metrics: {
      courses: courseList.length,
      documents: c0.documents,
    },
    usmle: { total: c0.usmle_total, byScope: byScope("usmle", c0.usmle_total) },
    aamc: { total: c0.aamc_total, byScope: byScope("aamc", c0.aamc_total) },
    systems,
    mostCovered,
  };
}

/**
 * Every framework topic (USMLE leaf domains + AAMC competencies) with the number
 * of distinct documents/courses that address it — INCLUDING gaps (0 docs, via
 * LEFT JOIN). The deterministic dataset behind the CSV/JSON export (R11).
 */
export async function getCoverageExportRows() {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT 'USMLE' AS framework, ud.domain AS system,
           CASE WHEN ud.subdomain IS NOT NULL THEN ud.domain || ' — ' || ud.subdomain ELSE ud.domain END AS topic,
           COALESCE(cov.docs, 0)::int AS docs, COALESCE(cov.courses, 0)::int AS courses
    FROM usmle_domains ud
    LEFT JOIN (
      SELECT a.framework_id, COUNT(DISTINCT c.document_id) AS docs, COUNT(DISTINCT d.course_id) AS courses
      FROM alignments a JOIN chunks c ON c.id = a.chunk_id JOIN documents d ON d.id = c.document_id
      WHERE a.framework = 'USMLE' GROUP BY a.framework_id
    ) cov ON cov.framework_id = ud.stable_id
    WHERE ud.parent_stable_id IS NOT NULL
    UNION ALL
    SELECT 'AAMC' AS framework, ac.domain_name AS system,
           COALESCE(ac.sub_id, ac.stable_id) || ': ' || ac.description AS topic,
           COALESCE(cov.docs, 0)::int AS docs, COALESCE(cov.courses, 0)::int AS courses
    FROM aamc_competencies ac
    LEFT JOIN (
      SELECT a.framework_id, COUNT(DISTINCT c.document_id) AS docs, COUNT(DISTINCT d.course_id) AS courses
      FROM alignments a JOIN chunks c ON c.id = a.chunk_id JOIN documents d ON d.id = c.document_id
      WHERE a.framework IN ('AAMC_PCRS','AAMC_EPA') GROUP BY a.framework_id
    ) cov ON cov.framework_id = ac.stable_id
    ORDER BY framework, system, topic
  `);
  return res.rows as CoverageExportRow[];
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
        documentId: chunks.documentId,
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

  // Per-document learning objectives (EO/TO), so the drawer can show the
  // objectives of the selected item's document. Deterministic join (R10/R12).
  const objectiveRows = await db
    .select({
      documentId: courseObjectives.documentId,
      eoCode: courseObjectives.eoCode,
      text: courseObjectives.text,
    })
    .from(courseObjectives)
    .innerJoin(documents, eq(documents.id, courseObjectives.documentId))
    .where(eq(documents.courseId, courseId))
    .orderBy(courseObjectives.ordinal);
  const objectivesByDocument: Record<number, { code: string | null; text: string }[]> = {};
  for (const o of objectiveRows) {
    if (o.documentId == null) continue;
    (objectivesByDocument[o.documentId] ??= []).push({ code: o.eoCode, text: o.text });
  }

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
      filename: documents.filename,
      asset: mediaAssets,
    })
    .from(chunkMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, chunkMedia.mediaAssetId))
    .innerJoin(chunks, eq(chunks.id, chunkMedia.chunkId))
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(eq(documents.courseId, courseId));

  // Official figure_captions text (keyed filename+label, see
  // scripts/import-figure-captions.ts) takes precedence over the mined
  // media_assets.text_for_embed shown below — a caption imported after the
  // document's last pipeline run reaches the map immediately instead of
  // waiting for the next reprocess/re-embed cycle.
  let captionByKey = new Map<string, string>();
  if (mediaLinkRows.length > 0) {
    const filenames = Array.from(new Set(mediaLinkRows.map((row) => row.filename)));
    const captionRows = await db
      .select({ filename: figureCaptions.filename, label: figureCaptions.label, textForEmbed: figureCaptions.textForEmbed })
      .from(figureCaptions)
      .where(inArray(figureCaptions.filename, filenames));
    captionByKey = buildCaptionByKey(captionRows);
  }

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
    const officialCaption = captionByKey.get(captionKey(row.filename, row.asset.label));
    list.push({
      id: row.asset.id,
      label: row.asset.label,
      textForEmbed: officialCaption ?? row.asset.textForEmbed,
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

  return { documents: docs, chunks: chunkRows, alignments: alignmentRows, mediaByChunkId, keywordsByChunkId, objectivesByDocument, aamc, usmle };
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

/**
 * Every catalog topic (USMLE leaf domains, organ-scoped when curated; all AAMC
 * competencies) for one course, each carrying its live distinct-document
 * count — 0 for topics with no alignment at all. The single source for the
 * gaps page's cards, its CSV export (KTD3), and getCourseSummary's "gaps"
 * list: one query, so none of them can diverge from each other.
 */
export async function getGapExportRows(
  courseId: number,
  // Pass the course's already-resolved target systems when the caller has
  // them (e.g. getCourseSummary) to skip a redundant course/documents fetch.
  // Standalone callers (the CSV export route) omit it and resolve it here.
  preloadedTargetSystems?: string[] | null,
): Promise<CoverageExportRow[]> {
  const db = getDb();
  let targetSystems = preloadedTargetSystems;
  if (targetSystems === undefined) {
    // Only course.code is needed here — a standalone caller (the CSV/JSON
    // export route) doesn't need the full documents array
    // getCourseWithDocuments also fetches.
    const [course] = await db.select({ code: courses.code }).from(courses).where(eq(courses.id, courseId));
    targetSystems = courseTargetSystems(course?.code);
  }

  const usmleRows = await db.execute(sql`
    SELECT ud.stable_id AS id, ud.domain AS system, ud.subdomain AS subdomain,
           COALESCE(doc.docs, 0)::int AS docs
    FROM usmle_domains ud
    LEFT JOIN (
      SELECT a.framework_id AS id, COUNT(DISTINCT c.document_id)::int AS docs
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE d.course_id = ${courseId} AND a.framework = 'USMLE'
      GROUP BY a.framework_id
    ) doc ON doc.id = ud.stable_id
    WHERE ud.parent_stable_id IS NOT NULL
      ${targetSystems ? sql`AND ud.domain IN (${sql.join(targetSystems.map((s) => sql`${s}`), sql`, `)})` : sql``}
  `);

  const aamcRows = await db.execute(sql`
    SELECT ac.stable_id AS id, ac.sub_id AS sub_id, ac.domain_name AS system,
           ac.description AS description, COALESCE(doc.docs, 0)::int AS docs
    FROM aamc_competencies ac
    LEFT JOIN (
      SELECT a.framework_id AS id, COUNT(DISTINCT c.document_id)::int AS docs
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE d.course_id = ${courseId} AND a.framework IN ('AAMC_PCRS','AAMC_EPA')
      GROUP BY a.framework_id
    ) doc ON doc.id = ac.stable_id
    WHERE ac.stable_id IS NOT NULL
  `);

  const usmle: CoverageExportRow[] = (
    usmleRows.rows as { id: string; system: string; subdomain: string | null; docs: number }[]
  ).map((r) => ({
    framework: "USMLE",
    system: r.system,
    topic: r.subdomain ? `${r.system} — ${r.subdomain}` : r.system,
    docs: r.docs,
    courses: r.docs > 0 ? 1 : 0,
  }));
  const aamc: CoverageExportRow[] = (
    aamcRows.rows as { id: string; sub_id: string | null; system: string; description: string; docs: number }[]
  ).map((r) => ({
    framework: "AAMC",
    system: r.system,
    // Same shape as the program export's AAMC topic (KTD3/R3): "<sub_id or
    // stable_id>: <description>", no embedded system name. sub_id is a
    // nullable column — fall back to the stable id rather than a literal
    // "null:" prefix.
    topic: `${r.sub_id ?? r.id}: ${r.description}`,
    docs: r.docs,
    courses: r.docs > 0 ? 1 : 0,
  }));
  return [...usmle, ...aamc];
}

async function getCourseObjectives(courseId: number) {
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

export async function getObjectivesExportRows(opts: {
  courseId?: number;
  module?: string;
}): Promise<ObjectivesExportRow[]> {
  const db = getDb();
  const conditions = [];
  if (opts.courseId != null) {
    conditions.push(eq(documents.courseId, opts.courseId));
  }
  if (opts.module && opts.module !== "all") {
    if (opts.module === "Unassigned") {
      const curated = curatedCourseCodesWithModule();
      if (curated.length > 0) {
        conditions.push(notInArray(courses.code, curated));
      }
    } else {
      const codes = courseCodesForModule(opts.module);
      if (codes.length === 0) {
        return [];
      }
      conditions.push(inArray(courses.code, codes));
    }
  }

  const raw = await db
    .select({
      objective: courseObjectives,
      document: documents,
      course: courses,
    })
    .from(courseObjectives)
    .innerJoin(documents, eq(documents.id, courseObjectives.documentId))
    .innerJoin(courses, eq(courses.id, documents.courseId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(courses.code, documents.caseNumber, courseObjectives.ordinal);

  const rows: ObjectivesExportRow[] = raw.map((r) => ({
    module: courseModule(r.course.code),
    courseCode: r.course.code,
    courseTitle: r.course.title,
    caseNumber: r.document.caseNumber ?? 0,
    caseTitle: r.document.caseTitle,
    ordinal: r.objective.ordinal ?? 0,
    objectiveCode: r.objective.eoCode,
    objective: r.objective.text,
    section: r.objective.sectionHeading,
    extractionMethod: r.objective.extractionMethod,
    confidence: r.objective.confidence,
    sourceFilename: r.document.filename,
    sourcePage: r.objective.sourcePage,
    sourceExcerpt: r.objective.sourceExcerpt,
    objectiveId: r.objective.id,
    documentId: r.document.id,
  }));

  return sortObjectivesExportRows(rows);
}

export type CaseLensKey = "all" | "faculty" | "self_study";

export type CaseLensMetrics = {
  objectives: { total: number; regex: number; llm: number };
  alignments: { total: number; reviewed: number; avgConfidence: number };
  usmle: CoverageDist;
  aamc: CoverageDist;
  heatmap: { system: string; status: ReturnType<typeof heatmapCellStatus> }[];
  topTopics: { label: string; framework: string; chunks: number }[];
};

export type CaseAnalyticsData = {
  case: { number: number; title: string | null; diagnosis: string | null; module: string };
  documents: { id: number; filename: string; guideKind: "faculty" | "self_study" }[];
  objectives: { total: number; regex: number; llm: number };
  alignments: { total: number; reviewed: number; avgConfidence: number };
  lenses: Record<CaseLensKey, CaseLensMetrics>;
  scopes: {
    case: {
      usmle: CoverageDist;
      aamc: CoverageDist;
      topTopics: { label: string; framework: string; chunks: number }[];
    };
    module: { label: string; usmle: CoverageDist; aamc: CoverageDist };
    entire: { usmle: CoverageDist; aamc: CoverageDist };
  };
  heatmap: { system: string; status: ReturnType<typeof heatmapCellStatus> }[];
  targetSystems: string[] | null;
};

/** Document ids included in a faculty / self-study / all lens. */
export function documentIdsForLens(
  docs: { id: number; guideKind: "faculty" | "self_study" }[],
  lens: CaseLensKey,
): number[] {
  if (lens === "all") return docs.map((d) => d.id);
  const kind = lens === "faculty" ? "faculty" : "self_study";
  return docs.filter((d) => d.guideKind === kind).map((d) => d.id);
}

export function countObjectivesForDocuments(
  rows: {
    document: { id: number; caseNumber: number | null };
    objective: { extractionMethod: string | null };
  }[],
  caseNumber: number,
  documentIds: Set<number>,
): { total: number; regex: number; llm: number } {
  let total = 0;
  let regex = 0;
  let llm = 0;
  for (const row of rows) {
    if (row.document.caseNumber !== caseNumber) continue;
    if (!documentIds.has(row.document.id)) continue;
    total++;
    if (row.objective.extractionMethod === "llm_cleanup") llm++;
    else regex++;
  }
  return { total, regex, llm };
}

export function aggregateAlignmentStatsByDocuments(
  rows: {
    document_id: number;
    total: number;
    reviewed: number;
    avg_confidence: string | null;
  }[],
  documentIds: Set<number>,
): { total: number; reviewed: number; avgConfidence: number } {
  let total = 0;
  let reviewed = 0;
  let weighted = 0;
  for (const row of rows) {
    if (!documentIds.has(row.document_id)) continue;
    total += row.total;
    reviewed += row.reviewed;
    weighted += Number(row.avg_confidence ?? 0) * row.total;
  }
  return {
    total,
    reviewed,
    avgConfidence: total > 0 ? weighted / total : 0,
  };
}

/** Per-framework distinct document counts for a document-id subset. */
export function rollupFrameworkDocCounts(
  rows: { framework_id: string; document_id: number }[],
  documentIds: Set<number>,
): number[] {
  const byFramework = new Map<string, Set<number>>();
  for (const row of rows) {
    if (!documentIds.has(row.document_id)) continue;
    const set = byFramework.get(row.framework_id) ?? new Set();
    set.add(row.document_id);
    byFramework.set(row.framework_id, set);
  }
  return Array.from(byFramework.values()).map((s) => s.size);
}

export function rollupTopTopicsForDocuments(
  rows: {
    framework_id: string;
    label: string;
    framework: string;
    document_id: number;
    chunks: number;
  }[],
  documentIds: Set<number>,
  limit = 8,
): { label: string; framework: string; chunks: number }[] {
  const byFramework = new Map<
    string,
    { label: string; framework: string; chunks: number }
  >();
  for (const row of rows) {
    if (!documentIds.has(row.document_id)) continue;
    const existing = byFramework.get(row.framework_id);
    if (existing) {
      existing.chunks += row.chunks;
    } else {
      byFramework.set(row.framework_id, {
        label: row.label,
        framework: row.framework ?? "",
        chunks: row.chunks,
      });
    }
  }
  return Array.from(byFramework.values())
    .sort((a, b) => b.chunks - a.chunks)
    .slice(0, limit);
}

export function buildHeatmapForDocumentLens(
  rows: { document_id: number; system: string; framework_id: string }[],
  documentIds: Set<number>,
  domainsTotalBySystem: Map<string, number>,
): { system: string; status: ReturnType<typeof heatmapCellStatus> }[] {
  const touchedBySystem = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!documentIds.has(row.document_id)) continue;
    const set = touchedBySystem.get(row.system) ?? new Set();
    set.add(row.framework_id);
    touchedBySystem.set(row.system, set);
  }
  return Array.from(touchedBySystem.entries())
    .map(([system, ids]) => ({
      system,
      status: heatmapCellStatus(ids.size, domainsTotalBySystem.get(system) ?? 0),
    }))
    .sort((a, b) => a.system.localeCompare(b.system));
}

export function buildCaseLensMetrics(
  lens: CaseLensKey,
  docs: { id: number; guideKind: "faculty" | "self_study" }[],
  inputs: {
    objectiveRows: Parameters<typeof countObjectivesForDocuments>[0];
    caseNumber: number;
    alignRows: Parameters<typeof aggregateAlignmentStatsByDocuments>[0];
    usmleFrameworkRows: { framework_id: string; document_id: number }[];
    aamcFrameworkRows: { framework_id: string; document_id: number }[];
    topTopicRows: Parameters<typeof rollupTopTopicsForDocuments>[0];
    heatmapFrameworkRows: { document_id: number; system: string; framework_id: string }[];
    allLensHeatmap: { system: string; status: ReturnType<typeof heatmapCellStatus> }[];
    domainsTotalBySystem: Map<string, number>;
    usmleTotal: number;
    aamcTotal: number;
  },
): CaseLensMetrics {
  const documentIds = new Set(documentIdsForLens(docs, lens));
  const objectives = countObjectivesForDocuments(
    inputs.objectiveRows,
    inputs.caseNumber,
    documentIds,
  );
  const alignments = aggregateAlignmentStatsByDocuments(inputs.alignRows, documentIds);
  const usmle = distribution(
    rollupFrameworkDocCounts(inputs.usmleFrameworkRows, documentIds),
    inputs.usmleTotal,
  );
  const aamc = distribution(
    rollupFrameworkDocCounts(inputs.aamcFrameworkRows, documentIds),
    inputs.aamcTotal,
  );
  const topTopics = rollupTopTopicsForDocuments(inputs.topTopicRows, documentIds);
  const heatmap =
    lens === "all"
      ? inputs.allLensHeatmap
      : buildHeatmapForDocumentLens(
          inputs.heatmapFrameworkRows,
          documentIds,
          inputs.domainsTotalBySystem,
        );
  return { objectives, alignments, usmle, aamc, heatmap, topTopics };
}

export function buildDomainsTotalBySystem(
  rows: { system: string; total: number }[],
  targetSystems: string[] | null,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (targetSystems && !targetSystems.includes(row.system)) continue;
    map.set(row.system, row.total);
  }
  return map;
}

/** One heatmap row for a single case — pure, exported for tests. */
export function filterHeatmapForCase(
  heatmap: { caseNumber: number; system: string; status: ReturnType<typeof heatmapCellStatus> }[],
  caseNumber: number,
): { system: string; status: ReturnType<typeof heatmapCellStatus> }[] {
  return heatmap
    .filter((h) => h.caseNumber === caseNumber)
    .map(({ system, status }) => ({ system, status }));
}

/** Sidebar list: one row per case_number, faculty title preferred. */
export function dedupeCaseList<
  T extends { caseNumber: number | null; caseTitle: string | null; filename: string },
>(docs: T[]): T[] {
  const byCase = new Map<number, T>();
  for (const d of docs) {
    const n = d.caseNumber ?? 0;
    if (n <= 0) continue;
    const existing = byCase.get(n);
    if (!existing || d.filename.includes("FacultyGuide")) {
      byCase.set(n, d);
    }
  }
  return Array.from(byCase.values()).sort((a, b) => (a.caseNumber ?? 0) - (b.caseNumber ?? 0));
}

export async function getCaseAnalytics(
  courseId: number,
  caseNumber: number,
): Promise<CaseAnalyticsData | null> {
  const { course, documents: allDocs } = await getCourseWithDocuments(courseId);
  if (!course) return null;

  const caseDocs = allDocs.filter((d) => d.caseNumber === caseNumber);
  if (caseDocs.length === 0) return null;

  const primaryDoc =
    caseDocs.find((d) => d.filename.includes("FacultyGuide")) ?? caseDocs[0];
  const moduleLabel = courseModule(course.code);
  const targetSystems = courseTargetSystems(course.code);
  const sysList = targetSystems
    ? sql.join(targetSystems.map((s) => sql`${s}`), sql`, `)
    : null;

  const [
    program,
    courseSummary,
    alignByDocRows,
    usmleFrameworkRows,
    aamcTotal,
    aamcFrameworkRows,
    topTopicRows,
    heatmapFrameworkRows,
    systemTotalsRes,
    objectiveRows,
  ] = await Promise.all([
    getProgramSummary(),
    getCourseSummary(courseId),
    getDb().execute(sql`
      SELECT d.id AS document_id,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE a.status IN ('approved','rejected'))::int AS reviewed,
             AVG(a.confidence::numeric) AS avg_confidence
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE d.course_id = ${courseId} AND d.case_number = ${caseNumber}
      GROUP BY d.id
    `),
    getDb().execute(sql`
      SELECT a.framework_id, c.document_id
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      ${targetSystems ? sql`JOIN usmle_domains ud ON ud.stable_id = a.framework_id` : sql``}
      WHERE d.course_id = ${courseId} AND d.case_number = ${caseNumber} AND a.framework = 'USMLE'
        ${sysList ? sql`AND ud.domain IN (${sysList})` : sql``}
      GROUP BY a.framework_id, c.document_id
    `),
    getDb().select().from(aamcCompetencies),
    getDb().execute(sql`
      SELECT a.framework_id, c.document_id
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE d.course_id = ${courseId} AND d.case_number = ${caseNumber}
        AND a.framework IN ('AAMC_PCRS','AAMC_EPA')
      GROUP BY a.framework_id, c.document_id
    `),
    getDb().execute(sql`
      SELECT a.framework_id,
             MIN(a.framework_label) AS label,
             MIN(a.framework) AS framework,
             c.document_id,
             COUNT(DISTINCT a.chunk_id)::int AS chunks
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE d.course_id = ${courseId} AND d.case_number = ${caseNumber}
      GROUP BY a.framework_id, c.document_id
    `),
    getDb().execute(sql`
      SELECT d.id AS document_id,
             a.framework_id,
             COALESCE(MIN(ud.domain), split_part(MIN(a.framework_label), ' — ', 1)) AS system
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN documents d ON d.id = c.document_id
      LEFT JOIN usmle_domains ud ON ud.stable_id = a.framework_id
      WHERE d.course_id = ${courseId} AND d.case_number = ${caseNumber} AND a.framework = 'USMLE'
      GROUP BY d.id, a.framework_id
    `),
    getDb().execute(sql`
      SELECT domain AS system, COUNT(*)::int AS total
      FROM usmle_domains WHERE parent_stable_id IS NOT NULL GROUP BY domain
    `),
    getCourseObjectives(courseId),
  ]);

  const usmleTotal = courseSummary?.metrics.usmleDomainsTotal ?? 1;
  const aamcTotalCount = aamcTotal.length || 1;

  const caseDocuments = caseDocs.map((d) => ({
    id: d.id,
    filename: d.filename,
    guideKind: inferGuideKind(d.filename),
  }));

  const allLensHeatmap = courseSummary
    ? filterHeatmapForCase(courseSummary.heatmap, caseNumber)
    : [];

  const lensInputs = {
    objectiveRows,
    caseNumber,
    alignRows: alignByDocRows.rows as {
      document_id: number;
      total: number;
      reviewed: number;
      avg_confidence: string | null;
    }[],
    usmleFrameworkRows: usmleFrameworkRows.rows as {
      framework_id: string;
      document_id: number;
    }[],
    aamcFrameworkRows: aamcFrameworkRows.rows as {
      framework_id: string;
      document_id: number;
    }[],
    topTopicRows: topTopicRows.rows as {
      framework_id: string;
      label: string;
      framework: string;
      document_id: number;
      chunks: number;
    }[],
    heatmapFrameworkRows: heatmapFrameworkRows.rows as {
      document_id: number;
      system: string;
      framework_id: string;
    }[],
    allLensHeatmap,
    domainsTotalBySystem: buildDomainsTotalBySystem(
      systemTotalsRes.rows as { system: string; total: number }[],
      targetSystems,
    ),
    usmleTotal,
    aamcTotal: aamcTotalCount,
  };

  const lenses = {
    all: buildCaseLensMetrics("all", caseDocuments, lensInputs),
    faculty: buildCaseLensMetrics("faculty", caseDocuments, lensInputs),
    self_study: buildCaseLensMetrics("self_study", caseDocuments, lensInputs),
  };

  const caseUsmleSpectrum = lenses.all.usmle;
  const caseAamcSpectrum = lenses.all.aamc;
  const objTotal = lenses.all.objectives.total;
  const regexCount = lenses.all.objectives.regex;
  const llmCount = lenses.all.objectives.llm;
  const stats = lenses.all.alignments;
  const heatmap = lenses.all.heatmap;

  const moduleUsmle =
    program.usmle.byScope[moduleLabel] ?? program.usmle.byScope["Entire curriculum"];
  const moduleAamc =
    program.aamc.byScope[moduleLabel] ?? program.aamc.byScope["Entire curriculum"];

  return {
    case: {
      number: caseNumber,
      title: primaryDoc.caseTitle,
      diagnosis: primaryDoc.diagnosis,
      module: moduleLabel,
    },
    documents: caseDocuments,
    objectives: { total: objTotal, regex: regexCount, llm: llmCount },
    alignments: {
      total: stats.total,
      reviewed: stats.reviewed,
      avgConfidence: stats.avgConfidence,
    },
    lenses,
    scopes: {
      case: {
        usmle: caseUsmleSpectrum,
        aamc: caseAamcSpectrum,
        topTopics: lenses.all.topTopics,
      },
      module: { label: moduleLabel, usmle: moduleUsmle, aamc: moduleAamc },
      entire: {
        usmle: program.usmle.byScope["Entire curriculum"],
        aamc: program.aamc.byScope["Entire curriculum"],
      },
    },
    heatmap,
    targetSystems,
  };
}
