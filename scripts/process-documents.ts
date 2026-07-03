import "./load-env";
import fs from "fs/promises";
import path from "path";
import { eq, sql } from "drizzle-orm";
import { documents } from "../drizzle/schema";
import {
  CheckpointTimer,
  loadBootstrapState,
  maybeCheckpoint,
  saveBootstrapState,
  type BootstrapPhase,
  type BootstrapState,
} from "../lib/bootstrap-state";
import { getDb } from "../lib/db";
import { runFullPipeline } from "../lib/pipeline";
import { copyCurriculumFiles } from "./curriculum-sources";

function markDocumentProcessed(state: BootstrapState, documentId: number) {
  // Manifest hint for bootstrap tracking; skip-complete uses DB pipeline status.
  if (!state.processedDocumentIds.includes(documentId)) {
    state.processedDocumentIds.push(documentId);
  }
}

export type DocumentPipelineStatus =
  | "empty"
  | "partial-embed"
  | "partial-align"
  | "complete";

export function deriveDocumentPipelineStatus(counts: {
  chunkCount: number;
  chunksWithEmbedding: number;
  alignedChunkCount: number;
}): DocumentPipelineStatus {
  if (counts.chunkCount === 0) return "empty";
  if (counts.chunksWithEmbedding < counts.chunkCount) return "partial-embed";
  if (counts.alignedChunkCount < counts.chunkCount) return "partial-align";
  return "complete";
}

export async function getDocumentPipelineStatus(
  documentId: number,
): Promise<DocumentPipelineStatus> {
  const map = await loadDocumentPipelineStatusMap([documentId]);
  return map.get(documentId) ?? "empty";
}

export async function loadDocumentPipelineStatusMap(
  documentIds: number[],
): Promise<Map<number, DocumentPipelineStatus>> {
  const statusMap = new Map<number, DocumentPipelineStatus>();
  for (const id of documentIds) {
    statusMap.set(id, "empty");
  }
  if (documentIds.length === 0) return statusMap;

  const db = getDb();
  const result = await db.execute(sql`
    SELECT
      c.document_id,
      COUNT(DISTINCT c.id)::int AS chunk_count,
      COUNT(DISTINCT c.id) FILTER (WHERE c.embedding IS NOT NULL)::int AS chunks_with_embedding,
      COUNT(DISTINCT a.chunk_id)::int AS aligned_chunk_count
    FROM chunks c
    LEFT JOIN alignments a ON a.chunk_id = c.id
    WHERE c.document_id IN (${sql.join(
      documentIds.map((id) => sql`${id}`),
      sql`, `,
    )})
    GROUP BY c.document_id
  `);

  for (const row of result.rows as {
    document_id: number;
    chunk_count: number;
    chunks_with_embedding: number;
    aligned_chunk_count: number;
  }[]) {
    statusMap.set(
      row.document_id,
      deriveDocumentPipelineStatus({
        chunkCount: row.chunk_count,
        chunksWithEmbedding: row.chunks_with_embedding,
        alignedChunkCount: row.aligned_chunk_count,
      }),
    );
  }

  return statusMap;
}

export async function isDocumentPipelineComplete(documentId: number): Promise<boolean> {
  return (await getDocumentPipelineStatus(documentId)) === "complete";
}

export async function processDocuments(options?: {
  onlyCase?: number | null;
  skipComplete?: boolean;
  force?: boolean;
  bootstrapPhase?: BootstrapPhase;
}) {
  await copyCurriculumFiles({ onlyCase: options?.onlyCase ?? null });
  const db = getDb();
  const docs = await db
    .select({
      id: documents.id,
      caseNumber: documents.caseNumber,
      filename: documents.filename,
    })
    .from(documents)
    .orderBy(documents.caseNumber);

  const tracking = Boolean(options?.bootstrapPhase);
  const state = tracking ? await loadBootstrapState() : undefined;
  const checkpoint = tracking ? new CheckpointTimer() : undefined;
  let dirty = false;

  if (state && options?.bootstrapPhase) {
    state.phase = options.bootstrapPhase;
    await saveBootstrapState(state);
  }

  const candidates = docs.filter(
    (doc) => !options?.onlyCase || doc.caseNumber === options.onlyCase,
  );
  const statusMap = options?.skipComplete
    ? await loadDocumentPipelineStatusMap(candidates.map((doc) => doc.id))
    : null;

  for (const doc of docs) {
    if (options?.onlyCase && doc.caseNumber !== options.onlyCase) continue;

    const filePath = path.join(process.cwd(), "data/curriculum", doc.filename);
    try {
      await fs.access(filePath);
    } catch {
      console.warn(`File not found, skipping: ${doc.filename}`);
      continue;
    }

    if (
      options?.skipComplete &&
      !options?.force &&
      statusMap?.get(doc.id) === "complete"
    ) {
      console.log(`Skip complete: ${doc.filename}`);
      if (state) {
        markDocumentProcessed(state, doc.id);
        dirty = true;
      }
      continue;
    }

    console.log(`Processing ${doc.filename}...`);
    await runFullPipeline({ documentId: doc.id, filePath });

    if (state) {
      markDocumentProcessed(state, doc.id);
      dirty = true;
      await maybeCheckpoint(
        checkpoint!,
        state,
        `processed document ${doc.id} (${doc.filename})`,
      );
    }
  }

  if (state && dirty) {
    await saveBootstrapState(state);
  }

  console.log("Done.");
}

function parseBootstrapPhase(): BootstrapPhase | undefined {
  if (process.argv.includes("--smoke")) return "process-smoke";
  if (process.argv.includes("--full")) return "process-full";
  // Deprecated alias for --full; prefer npm run db:bootstrap:full.
  if (process.argv.includes("--track-bootstrap")) return "process-full";
  return undefined;
}

async function main() {
  const onlyCase = process.env.PROCESS_CASE_NUMBER
    ? Number.parseInt(process.env.PROCESS_CASE_NUMBER, 10)
    : null;

  await processDocuments({
    onlyCase,
    skipComplete: process.argv.includes("--skip-complete"),
    force: process.argv.includes("--force"),
    bootstrapPhase: parseBootstrapPhase(),
  });
}

const isCli = path.basename(process.argv[1] ?? "") === "process-documents.ts";
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
