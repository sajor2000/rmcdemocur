import path from "path";
import { eq, sql } from "drizzle-orm";
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
  await db.delete(chunks).where(eq(chunks.documentId, documentId));
  await db.delete(gapSummary).where(eq(gapSummary.documentId, documentId));
  await db.delete(courseObjectives).where(eq(courseObjectives.documentId, documentId));
}

export async function runFullPipeline(options: {
  documentId: number;
  filePath: string;
  jobId?: number;
}) {
  const { documentId, filePath, jobId } = options;
  const db = getDb();

  const setStage = async (stage: PipelineStage, progress: number, message: string) => {
    if (jobId) await updateJob(jobId, { stage, progress, message, status: "running" });
  };

  try {
    await setStage("parsing", 10, "Parsing document...");
    const parsed = await parseDocument(filePath);
    await clearDocumentArtifacts(documentId);

    await setStage("extracting_objectives", 18, "Extracting learning objectives (regex-first)...");
    const { objectives, sectionsFound, llmUsed } = await extractAndCleanObjectives(parsed.text);
    for (const obj of objectives) {
      await db.insert(courseObjectives).values({
        documentId,
        ordinal: obj.ordinal,
        text: obj.text,
        sectionHeading: obj.sectionHeading,
        eoCode: obj.eoCode ?? null,
        extractionMethod: obj.extractionMethod,
        confidence: obj.confidence,
        sourceExcerpt: obj.text.slice(0, 500),
      });
    }
    const objMsg =
      objectives.length > 0
        ? `${objectives.length} objectives from ${sectionsFound} section(s)${llmUsed ? " (LLM cleanup applied)" : ""}`
        : sectionsFound > 0
          ? "Objective sections found but none extracted"
          : "No objective sections detected";
    await setStage("extracting_objectives", 22, objMsg);

    await setStage("chunking", 25, "Chunking content into ~500-token segments...");
    const built = buildChunksFromDocument(parsed.text);

    await setStage("embedding", 40, "Generating embeddings (Azure AI Foundry)...");
    const insertedChunkIds: number[] = [];
    const chunkEmbeddings = new Map<number, number[]>();
    for (let i = 0; i < built.length; i += BATCH_SIZE) {
      const batch = built.slice(i, i + BATCH_SIZE);
      for (const item of batch) {
        const embedding = await generateEmbedding(item.content);
        const [row] = await db
          .insert(chunks)
          .values({
            documentId,
            chunkIndex: item.chunkIndex,
            section: item.section,
            content: item.content,
            embedding,
          })
          .returning({ id: chunks.id });
        insertedChunkIds.push(row.id);
        chunkEmbeddings.set(row.id, embedding);
      }
      const pct = 40 + Math.floor(((i + batch.length) / built.length) * 25);
      await setStage("embedding", pct, `Generating embeddings (${Math.min(i + batch.length, built.length)}/${built.length})...`);
    }

    await setStage("aligning", 70, "Running alignment analysis against AAMC PCRS...");
    for (let i = 0; i < insertedChunkIds.length; i += BATCH_SIZE) {
      const batch = insertedChunkIds.slice(i, i + BATCH_SIZE);
      for (const chunkId of batch) {
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

        for (const a of aamc) {
          const fid = a.framework_id ?? "";
          const isEpa = fid.toLowerCase().includes("epa");
          await db.insert(alignments).values({
            chunkId,
            framework: isEpa ? "AAMC_EPA" : "AAMC_PCRS",
            frameworkId: fid,
            frameworkLabel: a.framework_label ?? fid,
            confidence: String(a.confidence),
            rationale: a.rationale,
          });
        }

        for (const u of usmle) {
          const fid = u.framework_id ?? u.domain ?? "";
          await db.insert(alignments).values({
            chunkId,
            framework: "USMLE",
            frameworkId: fid,
            frameworkLabel: u.framework_label ?? fid,
            confidence: String(u.confidence),
            rationale: u.rationale,
          });
        }
      }
      if (i === 0) {
        await setStage("aligning", 80, "Running alignment analysis against USMLE 2025...");
      }
    }

    await setStage("tagging", 90, "Tagging AAMC keywords...");
    for (const chunkId of insertedChunkIds) {
      const embedding = chunkEmbeddings.get(chunkId);
      if (!embedding) continue;
      try {
        const keywords = await retrieveKeywordCandidates(embedding, 5);
        for (const kw of keywords) {
          await db.insert(keywordTags).values({
            chunkId,
            keyword: kw.keyword,
            category: kw.stableId,
          });
        }
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

  if (job.status === "complete") {
    return job;
  }

  // Advance is handled by runFullPipeline in MVP — single advance kicks off processing
  if (job.stage === "queued") {
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
