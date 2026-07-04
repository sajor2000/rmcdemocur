import path from "path";
import { and, eq, sql } from "drizzle-orm";
import {
  alignments,
  chunks,
  courseObjectives,
  documents,
  gapSummary,
  keywordTags,
  processingJobs,
} from "@/drizzle/schema";
import { extractAndCleanObjectives } from "@/lib/objective-cleanup";
import { alignToFramework, generateEmbedding } from "@/lib/azure-ai";
import { buildChunksFromDocument } from "@/lib/chunker";
import { deriveCoverageStatus, recomputeCourseFrameworkGaps } from "@/lib/gap-analyzer";
import {
  buildEmbedTextForChunk,
  clearDocumentMedia,
  linkDocumentMediaToChunks,
  linkedMediaIdsForChunk,
  upsertDocumentMediaAssets,
} from "@/lib/media-pipeline";
import { parseDocument } from "@/lib/document-parser";
import { retrieveKeywordCandidates } from "@/lib/framework-rag";
import { getDb } from "@/lib/db";

export const PIPELINE_STAGES = [
  "queued",
  "parsing",
  "extracting_objectives",
  "chunking",
  "embedding",
  "aligning",
  "tagging",
  "recomputing_gaps",
  "complete",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

const BATCH_SIZE = 5;

async function updateJob(
  jobId: number,
  data: {
    stage?: string;
    progress?: number;
    message?: string;
    status?: string;
  },
) {
  const db = getDb();
  await db
    .update(processingJobs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(processingJobs.id, jobId));
}

export async function clearDocumentArtifacts(documentId: number) {
  const db = getDb();
  const existingChunks = await db
    .select({ id: chunks.id })
    .from(chunks)
    .where(eq(chunks.documentId, documentId));

  for (const c of existingChunks) {
    await db.delete(alignments).where(eq(alignments.chunkId, c.id));
    await db.delete(keywordTags).where(eq(keywordTags.chunkId, c.id));
  }
  // chunk_media references chunks.id (no cascade) — media must clear before chunks.
  await clearDocumentMedia(documentId);
  await db.delete(chunks).where(eq(chunks.documentId, documentId));
  await db.delete(gapSummary).where(eq(gapSummary.documentId, documentId));
  await db.delete(courseObjectives).where(eq(courseObjectives.documentId, documentId));
}

export type ExistingChunkRow = {
  id: number;
  chunkIndex: number | null;
  content: string;
  section: string | null;
  embedding: number[] | null;
};

/**
 * Resume gate: the chunker is deterministic, so a re-run over the same text
 * produces the same chunks in the same order. When the stored chunks match the
 * freshly built set by index + content, we can reuse them and skip the work
 * already done (embedding, alignment, tagging) instead of wiping and redoing
 * the whole document. Any divergence (chunker or source changed) falls back to
 * a clean rebuild, so correctness never depends on a stale partial.
 */
export function chunksMatchExisting(
  built: { chunkIndex: number; content: string }[],
  existing: { chunkIndex: number | null; content: string }[],
): boolean {
  if (existing.length !== built.length || built.length === 0) return false;
  const byIndex = new Map<number, string>();
  for (const row of existing) {
    if (row.chunkIndex == null) return false;
    byIndex.set(row.chunkIndex, row.content);
  }
  for (const item of built) {
    const content = byIndex.get(item.chunkIndex);
    if (content === undefined || content !== item.content) return false;
  }
  return true;
}

async function countCourseObjectives(documentId: number): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM course_objectives WHERE document_id = ${documentId}`,
  );
  return Number((res.rows[0] as { n?: number })?.n ?? 0);
}

/** chunk ids under a document that already have ≥1 alignment (fully aligned,
 * since per-chunk alignment rows are inserted in a single atomic statement). */
async function loadChunkIdsWithAlignments(documentId: number): Promise<Set<number>> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT DISTINCT a.chunk_id AS chunk_id
    FROM alignments a JOIN chunks c ON c.id = a.chunk_id
    WHERE c.document_id = ${documentId}
  `);
  return new Set((res.rows as { chunk_id: number }[]).map((r) => Number(r.chunk_id)));
}

/** chunk ids under a document that already carry keyword tags. */
async function loadChunkIdsWithKeywordTags(documentId: number): Promise<Set<number>> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT DISTINCT t.chunk_id AS chunk_id
    FROM keyword_tags t JOIN chunks c ON c.id = t.chunk_id
    WHERE c.document_id = ${documentId}
  `);
  return new Set((res.rows as { chunk_id: number }[]).map((r) => Number(r.chunk_id)));
}

export async function runFullPipeline(options: {
  documentId: number;
  filePath: string;
  jobId?: number;
  /** Force a clean rebuild, ignoring any resumable partial state. */
  force?: boolean;
}) {
  const { documentId, filePath, jobId, force } = options;
  const db = getDb();

  const setStage = async (stage: PipelineStage, progress: number, message: string) => {
    if (jobId) await updateJob(jobId, { stage, progress, message, status: "running" });
  };

  try {
    await setStage("parsing", 10, "Parsing document...");
    const parsed = await parseDocument(filePath);

    const [docMeta] = await db
      .select({
        caseTitle: documents.caseTitle,
        filename: documents.filename,
        caseNumber: documents.caseNumber,
      })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    await setStage("chunking", 25, "Chunking content into ~500-token segments...");
    const built = buildChunksFromDocument(
      parsed.text,
      docMeta?.caseTitle ?? undefined,
    );

    // Resume decision. If the document already holds chunks that match the
    // freshly built set, reuse them and pick up where a prior run stopped;
    // otherwise wipe any stale partial and rebuild cleanly.
    const existingChunkRows = (await db
      .select({
        id: chunks.id,
        chunkIndex: chunks.chunkIndex,
        content: chunks.content,
        section: chunks.section,
        embedding: chunks.embedding,
      })
      .from(chunks)
      .where(eq(chunks.documentId, documentId))) as ExistingChunkRow[];

    const resuming =
      !force &&
      existingChunkRows.length > 0 &&
      chunksMatchExisting(built, existingChunkRows);

    if (existingChunkRows.length > 0 && !resuming) {
      await clearDocumentArtifacts(documentId);
    }

    // Objectives: (re)extract on a fresh/rebuilt run, or when resuming a run
    // that crashed before objectives were written.
    const existingObjectiveCount = resuming ? await countCourseObjectives(documentId) : 0;
    if (!resuming || existingObjectiveCount === 0) {
      await setStage("extracting_objectives", 18, "Extracting learning objectives (regex-first)...");
      const { objectives, sectionsFound, llmUsed } = await extractAndCleanObjectives(parsed.text);
      if (resuming && objectives.length > 0) {
        await db.delete(courseObjectives).where(eq(courseObjectives.documentId, documentId));
      }
      for (const obj of objectives) {
        await db.insert(courseObjectives).values({
          documentId,
          ordinal: obj.ordinal,
          text: obj.text,
          sectionHeading: obj.sectionHeading,
          eoCode: obj.eoCode ?? null,
          extractionMethod: obj.extractionMethod,
          confidence: obj.confidence,
          sourceExcerpt: obj.sourceExcerpt.slice(0, 500),
        });
      }
      const objMsg =
        objectives.length > 0
          ? `${objectives.length} objectives from ${sectionsFound} section(s)${llmUsed ? " (LLM cleanup applied)" : ""}`
          : sectionsFound > 0
            ? "Objective sections found but none extracted"
            : "No objective sections detected";
      await setStage("extracting_objectives", 22, objMsg);
    } else {
      await setStage("extracting_objectives", 22, `Resuming — ${existingObjectiveCount} objectives already extracted`);
    }

    const mediaAssetsForDoc = await upsertDocumentMediaAssets({
      documentId,
      filename: docMeta?.filename ?? path.basename(filePath),
      fileType: parsed.fileType,
      caseNumber: docMeta?.caseNumber ?? 0,
      text: parsed.text,
    });

    await setStage(
      "embedding",
      40,
      resuming ? "Resuming from existing chunks..." : "Generating embeddings (Azure AI Foundry)...",
    );
    const insertedChunkIds: number[] = [];
    const chunkEmbeddings = new Map<number, number[]>();
    const insertedChunks: { id: number; content: string; section: string | null }[] = [];

    if (resuming) {
      // Reuse stored chunk rows (matched by chunkIndex) and carry over any
      // embeddings already computed so we don't re-pay Azure for them.
      const byIndex = new Map<number, ExistingChunkRow>();
      for (const row of existingChunkRows) {
        if (row.chunkIndex != null) byIndex.set(row.chunkIndex, row);
      }
      for (const item of built) {
        const row = byIndex.get(item.chunkIndex);
        if (!row) throw new Error(`resume: missing chunk index ${item.chunkIndex}`);
        insertedChunkIds.push(row.id);
        insertedChunks.push({ id: row.id, content: row.content, section: row.section });
        if (row.embedding) chunkEmbeddings.set(row.id, row.embedding);
      }
    } else {
      for (let i = 0; i < built.length; i += BATCH_SIZE) {
        const batch = built.slice(i, i + BATCH_SIZE);
        for (const item of batch) {
          const [row] = await db
            .insert(chunks)
            .values({
              documentId,
              chunkIndex: item.chunkIndex,
              section: item.section,
              content: item.content,
            })
            .returning({ id: chunks.id });
          insertedChunkIds.push(row.id);
          insertedChunks.push({
            id: row.id,
            content: item.content,
            section: item.section,
          });
        }
        const pct = 40 + Math.floor(((i + batch.length) / built.length) * 10);
        await setStage("embedding", pct, `Prepared chunks (${Math.min(i + batch.length, built.length)}/${built.length})...`);
      }
    }

    const { assets: linkedAssets, links } = await linkDocumentMediaToChunks({
      documentId,
      chunks: insertedChunks,
    });

    // A CSV caption correction changes a linked asset's textForEmbed (via the
    // merge in upsertDocumentMediaAssets) without changing chunk.content, so
    // the resume gate above would otherwise carry over the stale embedding
    // and the correction would never reach retrieval (KTD3/R8).
    const csvCaptionedAssetIds = new Set(
      linkedAssets.filter((asset) => asset.captionSource === "csv").map((asset) => asset.id),
    );
    const forceReembedChunkIds = new Set(
      links
        .filter((link) => csvCaptionedAssetIds.has(link.mediaAssetId))
        .map((link) => link.chunkId),
    );

    for (let i = 0; i < built.length; i += BATCH_SIZE) {
      const batch = built.slice(i, i + BATCH_SIZE);
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const chunkId = insertedChunkIds[i + j];
        // already embedded (resume) — unless a CSV caption on this chunk changed
        if (chunkEmbeddings.has(chunkId) && !forceReembedChunkIds.has(chunkId)) continue;
        const embedInput = buildEmbedTextForChunk(
          item.content,
          item.embedText,
          linkedAssets.length ? linkedAssets : mediaAssetsForDoc,
          linkedMediaIdsForChunk(chunkId, links),
        );
        const embedding = await generateEmbedding(embedInput);
        await db
          .update(chunks)
          .set({ embedding })
          .where(eq(chunks.id, chunkId));
        chunkEmbeddings.set(chunkId, embedding);
      }
      const pct = 50 + Math.floor(((i + batch.length) / built.length) * 15);
      await setStage(
        "embedding",
        pct,
        `Generating embeddings (${Math.min(i + batch.length, built.length)}/${built.length})...`,
      );
    }

    // Chunks already aligned/tagged are skipped on resume. A chunk with zero
    // alignments is re-processed (we can't distinguish "not yet aligned" from
    // "aligned to nothing" without a marker), so the skip covers the expensive
    // majority that did align, not the rare genuinely-empty chunks.
    const alignedChunkIds = resuming
      ? await loadChunkIdsWithAlignments(documentId)
      : new Set<number>();

    await setStage("aligning", 70, "Running alignment analysis against AAMC PCRS...");
    for (let i = 0; i < insertedChunkIds.length; i += BATCH_SIZE) {
      const batch = insertedChunkIds.slice(i, i + BATCH_SIZE);
      for (const chunkId of batch) {
        if (alignedChunkIds.has(chunkId)) continue;
        const [chunk] = await db
          .select()
          .from(chunks)
          .where(eq(chunks.id, chunkId));
        if (!chunk) continue;

        const chunkEmbedding = chunkEmbeddings.get(chunkId) ?? chunk.embedding ?? undefined;

        const [aamc, usmle] = await Promise.all([
          alignToFramework(chunk.content, "AAMC", { chunkEmbedding: chunkEmbedding ?? undefined }),
          alignToFramework(chunk.content, "USMLE", { chunkEmbedding: chunkEmbedding ?? undefined }),
        ]);

        // Insert both frameworks' rows in one statement so a crash can never
        // leave a chunk half-aligned (which resume would then wrongly skip).
        const alignmentRows = [
          ...aamc.map((a) => {
            const fid = a.framework_id ?? "";
            return {
              chunkId,
              framework: fid.toLowerCase().includes("epa") ? "AAMC_EPA" : "AAMC_PCRS",
              frameworkId: fid,
              frameworkLabel: a.framework_label ?? fid,
              confidence: String(a.confidence),
              rationale: a.rationale,
            };
          }),
          ...usmle.map((u) => {
            const fid = u.framework_id ?? u.domain ?? "";
            return {
              chunkId,
              framework: "USMLE",
              frameworkId: fid,
              frameworkLabel: u.framework_label ?? fid,
              confidence: String(u.confidence),
              rationale: u.rationale,
            };
          }),
        ];
        if (alignmentRows.length) await db.insert(alignments).values(alignmentRows);
      }
      if (i === 0) {
        await setStage("aligning", 80, "Running alignment analysis against USMLE 2025...");
      }
    }

    const taggedChunkIds = resuming
      ? await loadChunkIdsWithKeywordTags(documentId)
      : new Set<number>();

    await setStage("tagging", 90, "Tagging AAMC keywords...");
    for (const chunkId of insertedChunkIds) {
      if (taggedChunkIds.has(chunkId)) continue;
      const embedding = chunkEmbeddings.get(chunkId);
      if (!embedding) continue;
      try {
        const keywords = await retrieveKeywordCandidates(embedding, 5);
        const tagRows = keywords.map((kw) => ({
          chunkId,
          keyword: kw.keyword,
          category: kw.stableId,
        }));
        if (tagRows.length) await db.insert(keywordTags).values(tagRows);
      } catch {
        // keyword tagging optional when frameworks not embedded
      }
    }

    await setStage("recomputing_gaps", 95, "Recomputing gap summary...");
    await recomputeGapSummary(documentId);

    const [docRow] = await db
      .select({ courseId: documents.courseId })
      .from(documents)
      .where(eq(documents.id, documentId));
    if (docRow?.courseId) {
      await recomputeCourseFrameworkGaps(docRow.courseId);
    }

    const alignmentCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(alignments)
      .innerJoin(chunks, eq(chunks.id, alignments.chunkId))
      .where(eq(chunks.documentId, documentId));

    const msg = `✓ Processing complete — ${built.length} chunks, ${alignmentCount[0]?.count ?? 0} alignments generated`;
    if (jobId) {
      await updateJob(jobId, {
        stage: "complete",
        progress: 100,
        message: msg,
        status: "complete",
      });
    }
    return { chunkCount: built.length, alignmentCount: alignmentCount[0]?.count ?? 0 };
  } catch (error) {
    if (jobId) {
      await updateJob(jobId, {
        status: "failed",
        message: error instanceof Error ? error.message : "Processing failed",
      });
    }
    throw error;
  }
}

export async function recomputeGapSummary(documentId: number) {
  const db = getDb();
  await db.delete(gapSummary).where(eq(gapSummary.documentId, documentId));

  const rows = await db.execute(sql`
    SELECT a.framework, a.framework_id, a.framework_label,
           COUNT(DISTINCT c.id)::int as chunk_count,
           AVG(a.confidence::numeric) as avg_confidence
    FROM alignments a
    JOIN chunks c ON c.id = a.chunk_id
    WHERE c.document_id = ${documentId}
    GROUP BY a.framework, a.framework_id, a.framework_label
  `);

  for (const row of rows.rows as Record<string, unknown>[]) {
    const chunkCount = Number(row.chunk_count ?? 0);
    const avgConfidence = Number(row.avg_confidence ?? 0);
    await db.insert(gapSummary).values({
      documentId,
      framework: String(row.framework),
      frameworkId: String(row.framework_id),
      frameworkLabel: String(row.framework_label),
      coverageStatus: deriveCoverageStatus(chunkCount, avgConfidence),
      chunkCount,
      avgConfidence: String(avgConfidence.toFixed(2)),
    });
  }
}

export async function advanceJob(jobId: number) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, jobId));

  if (!job || !job.documentId) {
    throw new Error("Job not found");
  }

  if (job.status === "complete" || job.status === "failed") {
    return job;
  }

  if (job.status === "running") {
    return job;
  }

  // Advance is handled by runFullPipeline in MVP — single advance kicks off processing
  if (job.stage === "queued" && job.status === "queued") {
    const [claimed] = await db
      .update(processingJobs)
      .set({
        status: "running",
        stage: "parsing",
        progress: 5,
        message: "Starting pipeline...",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(processingJobs.id, jobId),
          eq(processingJobs.status, "queued"),
        ),
      )
      .returning();

    if (!claimed) {
      const [current] = await db
        .select()
        .from(processingJobs)
        .where(eq(processingJobs.id, jobId));
      return current ?? job;
    }

    const docRows = await db.execute(sql`
      SELECT filename FROM documents WHERE id = ${job.documentId}
    `);
    const filename = (docRows.rows[0] as { filename: string })?.filename;
    if (!filename) throw new Error("Document missing");
    const curriculumDir = path.join(process.cwd(), "data/curriculum");
    const filePath = path.join(curriculumDir, path.basename(filename));
    if (!filePath.startsWith(curriculumDir)) {
      throw new Error("Document missing");
    }
    await runFullPipeline({ documentId: job.documentId, filePath, jobId });
  }

  const [updated] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, jobId));
  return updated;
}
