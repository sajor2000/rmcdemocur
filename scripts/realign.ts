import "./load-env";
import { and, eq, inArray } from "drizzle-orm";
import { alignments, chunks, documents } from "../drizzle/schema";
import { alignToFramework } from "../lib/azure-ai";
import { getDb } from "../lib/db";

/** A chunk that already carries a faculty decision (approved/rejected) must not
 * be re-aligned — realignment deletes and re-inserts rows at the default
 * 'pending' status, which would silently discard the review. Coverage treats
 * faculty rejection as authoritative (see lib/queries.ts), so wiping it here
 * would reintroduce the exact defect. Returns true when the chunk is safe to
 * realign (no reviewed alignment present). */
async function chunkIsReviewed(db: ReturnType<typeof getDb>, chunkId: number): Promise<boolean> {
  const reviewed = await db
    .select({ id: alignments.id })
    .from(alignments)
    .where(
      and(
        eq(alignments.chunkId, chunkId),
        inArray(alignments.status, ["approved", "rejected"]),
      ),
    )
    .limit(1);
  return reviewed.length > 0;
}

async function realignDocument(documentId: number) {
  const db = getDb();
  const chunkRows = await db
    .select()
    .from(chunks)
    .where(eq(chunks.documentId, documentId))
    .orderBy(chunks.chunkIndex);

  let skipped = 0;
  for (const chunk of chunkRows) {
    if (await chunkIsReviewed(db, chunk.id)) {
      skipped++;
      continue;
    }
    // chunkIsReviewed already guaranteed this chunk carries no approved/rejected
    // alignment, so every remaining row (pending, or a legacy NULL status) is
    // safe to clear before re-aligning. Delete by chunk directly — a `<>`
    // status guard would leak NULL-status rows (SQL `NULL <> x` is not TRUE),
    // duplicating them against the re-inserted rows.
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
  if (skipped > 0) {
    console.log(
      `  Preserved ${skipped} reviewed chunk(s) in document ${documentId} (skipped realignment to keep faculty decisions).`,
    );
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
