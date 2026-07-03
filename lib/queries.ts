import { sql, eq, desc, and } from "drizzle-orm";
import {
  alignments,
  aamcCompetencies,
  chunkMedia,
  chunks,
  courseObjectives,
  courses,
  documents,
  gapSummary,
  mediaAssets,
  usmleDomains,
} from "@/drizzle/schema";
import { getDb } from "@/lib/db";
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

export async function getCourseSummary(courseId: number) {
  const db = getDb();
  const { course, documents: docs } = await getCourseWithDocuments(courseId);
  if (!course) return null;

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
           COUNT(*)::int as total
    FROM alignments a
    JOIN chunks c ON c.id = a.chunk_id
    JOIN documents d ON d.id = c.document_id
    WHERE d.course_id = ${courseId}
  `);
  const stats = alignmentStats.rows[0] as {
    avg_confidence: string | null;
    total: number;
  };

  const aamcCoverage = await db.execute(sql`
    SELECT ac.domain_name, COUNT(DISTINCT a.id)::int as cnt
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

  const heatmap = await db.execute(sql`
    SELECT d.case_number, gs.framework_id, gs.framework_label, gs.coverage_status
    FROM gap_summary gs
    JOIN documents d ON d.id = gs.document_id
    WHERE d.course_id = ${courseId} AND gs.framework = 'USMLE'
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

  return {
    course,
    documents: docs,
    metrics: {
      aamcCoveragePercent: aamcPct,
      usmleGaps: gaps.filter((g) => g.gap_summary.coverageStatus === "gap").length,
      avgConfidence: Number(stats?.avg_confidence ?? 0),
      guidesProcessed: docs.length,
      usmleDomainsCovered: usmleAlignedCount,
      usmleDomainsTotal: totalUsmleLeafCount || 1,
    },
    aamcDomainCoverage: (aamcCoverage.rows as { domain_name: string; cnt: number }[]).map(
      (r) => ({
        domain: r.domain_name,
        count: r.cnt,
        percent: Math.min(100, r.cnt * 12),
      }),
    ),
    heatmap: (heatmap.rows as Record<string, unknown>[]).map((r) => ({
      caseNumber: Number(r.case_number),
      domainId: String(r.framework_id),
      domainLabel: String(r.framework_label),
      status: String(r.coverage_status),
    })),
    gaps: gaps.map((g) => g.gap_summary),
    recentAlignments,
    coveredDomains: usmleAlignedCount,
  };
}

export async function getMapData(courseId: number) {
  const db = getDb();
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.courseId, courseId))
    .orderBy(documents.caseNumber);

  const chunkRows = await db
    .select({
      chunk: chunks,
      document: documents,
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
      storagePath: string | null;
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
      storagePath: row.asset.storagePath,
      hasCaptionInText: row.asset.hasCaptionInText,
      referenceKind: row.asset.referenceKind,
    });
    mediaByChunkId[row.chunkId] = list;
  }

  const aamc = await db.select().from(aamcCompetencies);
  const usmle = await db.select().from(usmleDomains);

  return { documents: docs, chunks: chunkRows, alignments: alignmentRows, mediaByChunkId, aamc, usmle };
}

export async function searchChunks(courseId: number, queryEmbedding: number[], limit = 5) {
  const db = getDb();
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  const result = await db.execute(sql`
    SELECT c.*, d.filename, d.case_title,
           1 - (c.embedding <=> ${vectorStr}::vector) AS similarity
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE d.course_id = ${courseId}
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
