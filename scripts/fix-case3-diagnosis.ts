import "./load-env";
import path from "path";
import { and, eq } from "drizzle-orm";
import { documents } from "../drizzle/schema";
import { getDb } from "../lib/db";

/**
 * One-shot corrective update for the Case 3 (Marie Hernandez) diagnosis.
 *
 * The live case page (components/cases/CaseAnalyticsView.tsx) reads
 * documents.diagnosis from the database, which is only ever written by
 * scripts/seed.ts. Case 3 was mislabeled "Bacterial meningitis" — it is
 * glutaric acidemia (an organic acidemia, i.e. a metabolism disorder, which
 * fits RMD 563 "Food to Fuel"; a CNS infection does not).
 *
 * seedCourse() does a full FK-safe wipe + reseed of documents (and all
 * alignments/chunks), so re-seeding to fix one string would churn the real
 * processed data. This targeted UPDATE corrects the live row in place and is
 * idempotent — running it again is a no-op. The seed strings themselves are
 * also corrected so a future reseed stays right.
 */
const CORRECT_DIAGNOSIS = "Glutaric acidemia";
const CASE_NUMBER = 3;
const COURSE_ID = 1;

export async function fixCase3Diagnosis(): Promise<number> {
  const db = getDb();
  const updated = await db
    .update(documents)
    .set({ diagnosis: CORRECT_DIAGNOSIS })
    .where(and(eq(documents.courseId, COURSE_ID), eq(documents.caseNumber, CASE_NUMBER)))
    .returning({ id: documents.id, filename: documents.filename });
  return updated.length;
}

async function main() {
  const count = await fixCase3Diagnosis();
  console.log(
    `Set Case ${CASE_NUMBER} diagnosis to "${CORRECT_DIAGNOSIS}" on ${count} document row(s).`,
  );
}

const isCli = path.basename(process.argv[1] ?? "") === "fix-case3-diagnosis.ts";
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
