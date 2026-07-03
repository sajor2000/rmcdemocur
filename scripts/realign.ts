import "./load-env";
import { eq } from "drizzle-orm";
import { alignments, chunks, documents } from "../drizzle/schema";
import { alignToFramework } from "../lib/azure-ai";
import { recomputeCourseFrameworkGaps } from "../lib/gap-analyzer";
import { getDb } from "../lib/db";
import { recomputeGapSummary } from "../lib/pipeline";

async function realignDocument(documentId: number) {
  const db = getDb();
  const chunkRows = await db
    .select()
    .from(chunks)
    .where(eq(chunks.documentId, documentId))
    .orderBy(chunks.chunkIndex);

  for (const chunk of chunkRows) {
    await db.delete(alignments).where(eq(alignments.chunkId, chunk.id));

    const embedding = chunk.embedding ?? undefined;
    const [aamc, usmle] = await Promise.all([
      alignToFramework(chunk.content, "AAMC", { chunkEmbedding: embedding }),
      alignToFramework(chunk.content, "USMLE", { chunkEmbedding: embedding }),
    ]);

    for (const a of aamc) {
      const fid = a.framework_id ?? "";
      const isEpa = fid.toLowerCase().includes("epa");
      await db.insert(alignments).values({
        chunkId: chunk.id,
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
        chunkId: chunk.id,
        framework: "USMLE",
        frameworkId: fid,
        frameworkLabel: u.framework_label ?? fid,
        confidence: String(u.confidence),
        rationale: u.rationale,
      });
    }
  }

  await recomputeGapSummary(documentId);
  const [doc] = await db
    .select({ courseId: documents.courseId })
    .from(documents)
    .where(eq(documents.id, documentId));
  if (doc?.courseId) {
    await recomputeCourseFrameworkGaps(doc.courseId);
  }
}

async function main() {
  const db = getDb();
  const courseId = Number(process.argv[2] ?? 1);
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.courseId, courseId))
    .orderBy(documents.caseNumber);

  if (!docs.length) {
    console.error(`No documents for course ${courseId}`);
    process.exit(1);
  }

  for (const doc of docs) {
    console.log(`Realigning document ${doc.id} (${doc.filename})...`);
    await realignDocument(doc.id);
  }

  console.log(`Done. Realigned ${docs.length} documents for course ${courseId}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
