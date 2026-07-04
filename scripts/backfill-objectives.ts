/**
 * Re-extract course objectives for every document and replace the stored rows,
 * without re-embedding or re-aligning. Use after an objective-extractor change
 * to backfill the database (e.g. TO-#### topic-objective support) so the
 * Objectives page reflects the fix. Uses the same extractAndCleanObjectives path
 * the pipeline uses, so results match a full reprocess.
 *
 * Usage: npx tsx scripts/backfill-objectives.ts
 */
import "./load-env";
import path from "path";
import fs from "fs/promises";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { documents, courseObjectives } from "../drizzle/schema";
import { parseDocument } from "../lib/document-parser";
import { extractAndCleanObjectives } from "../lib/objective-cleanup";
import { extractObjectivesFromText } from "../lib/objective-extractor";

const CURRICULUM_DIR = path.join(process.cwd(), "data/curriculum");

async function main() {
  const db = getDb();
  // Default matches the pipeline (regex + optional LLM cleanup). --regex-only
  // forces the deterministic regex path for reproducible backfills (the LLM
  // cleanup can vary run-to-run and needs Azure creds).
  const regexOnly = process.argv.includes("--regex-only");
  const docs = await db
    .select({ id: documents.id, filename: documents.filename })
    .from(documents)
    .orderBy(documents.caseNumber);

  let updated = 0;
  for (const doc of docs) {
    const filePath = path.join(CURRICULUM_DIR, doc.filename);
    try {
      await fs.access(filePath);
    } catch {
      console.warn(`skip (file missing): ${doc.filename}`);
      continue;
    }

    const before = (
      await db.select().from(courseObjectives).where(eq(courseObjectives.documentId, doc.id))
    ).length;

    // Extract BEFORE deleting so a parse/extract failure leaves the existing
    // objectives intact (the throw skips this document's delete entirely).
    const parsed = await parseDocument(filePath);
    const objectives = regexOnly
      ? extractObjectivesFromText(parsed.text)
      : (await extractAndCleanObjectives(parsed.text)).objectives;
    const rows = objectives.map((obj) => ({
      documentId: doc.id,
      ordinal: obj.ordinal,
      text: obj.text,
      sectionHeading: obj.sectionHeading,
      eoCode: obj.eoCode ?? null,
      extractionMethod: obj.extractionMethod,
      confidence: obj.confidence,
      sourceExcerpt: obj.sourceExcerpt.slice(0, 500),
    }));

    // Replace atomically. The neon-http driver has no interactive transactions,
    // but db.batch runs its statements as a single transaction — so the delete
    // and the one multi-row insert can't half-apply and leave a document with
    // partially-rewritten objectives.
    if (rows.length) {
      await db.batch([
        db.delete(courseObjectives).where(eq(courseObjectives.documentId, doc.id)),
        db.insert(courseObjectives).values(rows),
      ]);
    } else {
      await db.delete(courseObjectives).where(eq(courseObjectives.documentId, doc.id));
    }
    const delta = objectives.length - before;
    console.log(
      `${doc.filename}: ${before} → ${objectives.length}${delta !== 0 ? `  (${delta > 0 ? "+" : ""}${delta})` : ""}`,
    );
    updated++;
  }
  console.log(`\nBackfilled objectives for ${updated} documents.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
