import "./load-env";
import { eq, sql } from "drizzle-orm";
import { documents } from "../drizzle/schema";
import {
  loadBootstrapState,
  updateBootstrapState,
} from "../lib/bootstrap-state";
import { getDb, type Db } from "../lib/db";
import { countFrameworkEmbeddings } from "../lib/framework-counts";
import { pushSchema } from "./db-init";
import { isDocumentPipelineComplete, processDocuments } from "./process-documents";
import { seedCourse } from "./seed";
import { seedFrameworks } from "./seed-frameworks";

async function verifyCase1GiUsmleLabels(
  db: Db,
  documentId: number,
): Promise<string[]> {
  const giAlignments = await db.execute(sql`
    SELECT a.framework_id
    FROM alignments a
    JOIN chunks c ON c.id = a.chunk_id
    WHERE c.document_id = ${documentId}
      AND a.framework = 'usmle'
      AND a.framework_id LIKE '%gastrointestinal%'
  `);
  const giRows = giAlignments.rows as { framework_id: string }[];
  const errors: string[] = [];

  const hasGiSystem = giRows.some((r) =>
    r.framework_id.startsWith("usmle:gastrointestinal-system:"),
  );
  const hasMislabeledGi = giRows.some(
    (r) =>
      r.framework_id.includes("social-sciences") &&
      r.framework_id.includes("gastrointestinal"),
  );

  if (giRows.length > 0 && !hasGiSystem) {
    errors.push(
      "Case 1 USMLE GI alignments missing usmle:gastrointestinal-system:* prefix",
    );
  }
  if (hasMislabeledGi) {
    errors.push(
      "Case 1 has mislabeled usmle:social-sciences:* GI alignments — re-run db:seed-frameworks --force",
    );
  }
  return errors;
}

async function verifySmoke(caseNumber: number): Promise<string[]> {
  const db = getDb();
  const [state, usmleCount] = await Promise.all([
    loadBootstrapState(),
    countFrameworkEmbeddings("usmle_domains"),
  ]);
  const errors: string[] = [];

  for (const key of ["usmle", "aamc"] as const) {
    const progress = state.frameworks[key];
    if (!progress.complete) {
      errors.push(
        `${key.toUpperCase()} frameworks incomplete (${progress.embedded}/${progress.total} embedded)`,
      );
    }
  }

  const expected = state.frameworks.usmle.total;
  if (expected > 0 && usmleCount < expected * 0.9) {
    errors.push(`Expected USMLE embeddings (got ${usmleCount}/${expected})`);
  }

  const docRows = await db
    .select({ id: documents.id, filename: documents.filename })
    .from(documents)
    .where(eq(documents.caseNumber, caseNumber));

  if (docRows.length === 0) {
    errors.push(`No documents for case ${caseNumber}`);
    return errors;
  }

  for (const doc of docRows) {
    if (!(await isDocumentPipelineComplete(doc.id))) {
      errors.push(
        `Case ${caseNumber} pipeline incomplete for ${doc.filename} (chunks/embed/alignments)`,
      );
    }
  }

  const facultyDoc = docRows.find((d) => d.filename.includes("FacultyGuide"));
  if (caseNumber === 1 && facultyDoc) {
    errors.push(...(await verifyCase1GiUsmleLabels(db, facultyDoc.id)));
  }

  return errors;
}

async function smokeBootstrap() {
  console.log("\n=== Bootstrap SMOKE (Case 1) ===\n");
  console.log("Validates schema + Azure embed/align before full pipeline.\n");

  const caseNumber = 1;
  await updateBootstrapState((state) => {
    state.phase = "schema";
    state.smokeCaseNumber = caseNumber;
  });

  await pushSchema();
  await updateBootstrapState({ phase: "frameworks" });

  await seedFrameworks({ trackBootstrap: true });

  const preSeedState = await loadBootstrapState();
  if (!preSeedState.courseSeeded) {
    await updateBootstrapState({ phase: "course-seed" });
    await seedCourse();
    await updateBootstrapState({
      phase: "course-seed",
      courseSeeded: true,
      processedDocumentIds: [],
    });
  }

  const smokeSummary = await processDocuments({
    onlyCase: caseNumber,
    skipComplete: true,
    bootstrapPhase: "process-smoke",
  });

  const errors = await verifySmoke(caseNumber);
  if (errors.length > 0) {
    console.error("\nSmoke verification FAILED:");
    for (const e of errors) console.error(`  - ${e}`);
    // Surface the specific per-document failures so the operator sees the cause,
    // not just the generic incomplete-pipeline result.
    if (smokeSummary.exitCode !== 0) console.error(`\n${smokeSummary.message}`);
    process.exit(1);
  }

  await updateBootstrapState({
    smokeVerified: true,
    smokeVerifiedAt: new Date().toISOString(),
    phase: "process-smoke",
  });

  console.log("\n✓ Smoke passed — schema and AI pipeline verified for Case 1.");
  console.log("  Run: npm run db:bootstrap:full\n");
}

async function fullBootstrap() {
  const state = await loadBootstrapState();
  if (!state.smokeVerified) {
    console.error(
      "Smoke not verified. Run `npm run db:bootstrap:smoke` first to validate schema + Azure.",
    );
    process.exit(1);
  }

  const db = getDb();
  const docCount = await db
    .select({ id: documents.id })
    .from(documents)
    .then((rows) => rows.length);
  if (docCount === 0) {
    console.error(
      "No documents in DB. Run `npm run db:bootstrap:smoke` (or db:seed) before full bootstrap.",
    );
    process.exit(1);
  }

  console.log("\n=== Bootstrap FULL (all documents, checkpoint every 5 min) ===\n");

  await updateBootstrapState({ phase: "process-full" });

  const summary = await processDocuments({
    skipComplete: true,
    bootstrapPhase: "process-full",
  });

  // Per-document isolation means failures no longer throw — a phase must not be
  // marked complete when any document failed (the documented "false complete" trap).
  if (summary.exitCode !== 0) {
    console.error(`\nFull bootstrap INCOMPLETE:\n${summary.message}`);
    console.error("Fix the failing documents and re-run npm run db:bootstrap:full.\n");
    process.exit(1);
  }

  await updateBootstrapState({ phase: "complete" });

  console.log("\n✓ Full bootstrap complete. Run: npm run dev → /courses/1\n");
}

async function main() {
  const mode = process.argv[2] ?? "smoke";
  if (mode === "smoke") {
    await smokeBootstrap();
  } else if (mode === "full") {
    await fullBootstrap();
  } else if (mode === "status") {
    const state = await loadBootstrapState();
    console.log(JSON.stringify(state, null, 2));
  } else {
    console.error("Usage: tsx scripts/bootstrap.ts [smoke|full|status]");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
