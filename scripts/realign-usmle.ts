import "./load-env";
import { and, eq } from "drizzle-orm";
import { alignments, chunks, documents, usmleDomains } from "../drizzle/schema";
import { alignToFramework } from "../lib/azure-ai";
import { hasReviewedAlignment } from "../lib/alignment-review";
import { getDb } from "../lib/db";

/**
 * Phase-B migration: re-align ONLY the USMLE framework against the corrected
 * taxonomy, per course. AAMC alignments are left untouched — the AAMC taxonomy
 * did not change, so re-running it would waste ~half the cost and needlessly
 * re-baseline AAMC coverage (the LLM aligner is nondeterministic).
 *
 * Review-preserving: a chunk that carries any faculty-approved/rejected
 * alignment is skipped (its old USMLE framework_id stays, and shows up in the
 * orphan audit for re-align + re-approval — surfacing is not fixing).
 */
/** Retry a transient-failing async op (the Neon serverless connection drops
 * intermittently with ConnectTimeoutError). Small linear backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 750 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Which stableIds are in the current (new) taxonomy — used to decide whether a
 * chunk still holds an OLD-taxonomy USMLE alignment (i.e. not yet migrated). */
async function loadValidStableIds(db: ReturnType<typeof getDb>): Promise<Set<string>> {
  const rows = await withRetry(() => db.select({ stableId: usmleDomains.stableId }).from(usmleDomains));
  return new Set(rows.map((r) => r.stableId));
}

async function realignUsmleForCourse(courseId: number) {
  const db = getDb();
  const valid = await loadValidStableIds(db);
  const chunkRows = await withRetry(() =>
    db
      .select({ id: chunks.id, content: chunks.content, embedding: chunks.embedding })
      .from(chunks)
      .innerJoin(documents, eq(documents.id, chunks.documentId))
      .where(eq(documents.courseId, courseId))
      .orderBy(chunks.id),
  );

  let realigned = 0;
  let skippedReviewed = 0;
  let skippedDone = 0;
  let failed = 0;
  let produced = 0;
  for (const chunk of chunkRows) {
    // Whole body is fault-tolerant: the Neon connection intermittently drops
    // (ConnectTimeoutError), so ANY DB read/write or the align call may throw.
    // withRetry absorbs transient blips; a chunk that still fails is skipped and
    // picked up on the next resume pass (it keeps its orphaned USMLE row).
    try {
      const existing = await withRetry(() =>
        db
          .select({ status: alignments.status, framework: alignments.framework, frameworkId: alignments.frameworkId })
          .from(alignments)
          .where(eq(alignments.chunkId, chunk.id)),
      );

      if (hasReviewedAlignment(existing.map((r) => r.status))) {
        skippedReviewed++;
        continue;
      }

      // Resume-aware: a chunk is "already migrated" when none of its USMLE
      // alignments reference a removed (old-taxonomy) node.
      const usmleRows = existing.filter((r) => r.framework === "USMLE");
      const hasOrphan = usmleRows.some((r) => r.frameworkId && !valid.has(r.frameworkId));
      if (usmleRows.length > 0 && !hasOrphan) {
        skippedDone++;
        continue;
      }

      // Replace only this chunk's USMLE alignments; AAMC rows stay.
      await withRetry(() =>
        db.delete(alignments).where(and(eq(alignments.chunkId, chunk.id), eq(alignments.framework, "USMLE"))),
      );

      const usmle = await withRetry(() =>
        alignToFramework(chunk.content, "USMLE", { chunkEmbedding: chunk.embedding ?? undefined }),
      );
      const rows = usmle.map((u) => {
        const fid = u.framework_id ?? u.domain ?? "";
        return {
          chunkId: chunk.id,
          framework: "USMLE",
          frameworkId: fid,
          frameworkLabel: u.framework_label ?? fid,
          confidence: String(u.confidence),
          rationale: u.rationale,
        };
      });
      if (rows.length) {
        await withRetry(() => db.insert(alignments).values(rows));
        produced += rows.length;
      }
      realigned++;
      if (realigned % 50 === 0) {
        console.log(`  ${realigned} realigned, ${skippedDone} already-done, ${failed} failed (${produced} USMLE alignments)`);
      }
    } catch (err) {
      failed++;
      console.error(`  chunk ${chunk.id} failed (will retry on resume): ${(err as Error).message.slice(0, 100)}`);
    }
  }
  console.log(
    `Course ${courseId}: realigned ${realigned} chunks (${produced} USMLE alignments), skipped ${skippedDone} already-migrated, ${skippedReviewed} reviewed, ${failed} failed.`,
  );
  return { realigned, skippedDone, skippedReviewed, failed };
}

async function main() {
  const courseId = Number(process.argv[2] ?? 1);
  console.log(`Re-aligning USMLE for course ${courseId} against the corrected taxonomy...`);
  await realignUsmleForCourse(courseId);
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
