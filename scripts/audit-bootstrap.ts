import "./load-env";
import path from "path";
import { sql } from "drizzle-orm";
import { loadBootstrapState } from "../lib/bootstrap-state";
import { countCachedEmbeddings } from "../lib/embedding-cache";
import { getDb } from "../lib/db";
import { getDocumentPipelineStatus } from "./process-documents";

async function countTableEmbeddings(table: string): Promise<number> {
  const db = getDb();
  const result = await db.execute(
    sql.raw(
      `SELECT COUNT(*)::int AS cnt FROM ${table} WHERE embedding IS NOT NULL`,
    ),
  );
  return Number((result.rows[0] as { cnt: number })?.cnt ?? 0);
}

async function main() {
  const db = getDb();
  const state = await loadBootstrapState();
  const cacheCount = await countCachedEmbeddings();

  const usmleDb = await countTableEmbeddings("usmle_domains");
  const aamcDb = await countTableEmbeddings("aamc_competencies");
  const kwDb = await countTableEmbeddings("aamc_keywords");

  console.log("\n=== Bootstrap Audit (read-only) ===\n");
  console.log(`Phase:              ${state.phase}`);
  console.log(
    `Smoke verified:     ${state.smokeVerified}${state.smokeVerifiedAt ? ` (${state.smokeVerifiedAt})` : ""}`,
  );
  console.log(`Course seeded:      ${state.courseSeeded}`);
  console.log("");
  console.log(
    `USMLE embedded:     ${usmleDb} (DB) | ${state.frameworks.usmle.embedded}/${state.frameworks.usmle.total} (manifest) | ${cacheCount} cache entries`,
  );
  console.log(
    `AAMC embedded:      ${aamcDb} (DB) | ${state.frameworks.aamc.embedded}/${state.frameworks.aamc.total} (manifest)`,
  );
  console.log(
    `Keywords embedded:  ${kwDb} (DB) | ${state.frameworks.keywords.embedded}/${state.frameworks.keywords.total} (manifest)`,
  );

  const docs = await db.execute(sql`
    SELECT id, filename, case_number FROM documents ORDER BY case_number, id
  `);

  let complete = 0;
  let partial = 0;
  let empty = 0;

  console.log("\nDocuments:");
  for (const row of docs.rows as {
    id: number;
    filename: string;
    case_number: number | null;
  }[]) {
    const status = await getDocumentPipelineStatus(row.id);
    const label = status === "complete" ? "complete" : status;
    console.log(`  [${label}] case ${row.case_number ?? "?"} — ${row.filename}`);
    if (status === "complete") complete += 1;
    else if (status === "empty") empty += 1;
    else partial += 1;
  }

  console.log(
    `\nSummary: ${complete} complete, ${partial} partial, ${empty} pending (${docs.rows.length} total)`,
  );

  const issues: string[] = [];
  if (
    state.frameworks.usmle.total > 0 &&
    usmleDb !== state.frameworks.usmle.embedded
  ) {
    issues.push("USMLE manifest count differs from DB embedded count");
  }
  if (partial > 0) {
    issues.push(
      `${partial} document(s) in partial state — re-run process or use --force`,
    );
  }

  if (issues.length > 0) {
    console.error("\nIssues:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }

  console.log("\n✓ Audit passed — manifest, DB, and document states are consistent.\n");
}

const isCli = path.basename(process.argv[1] ?? "") === "audit-bootstrap.ts";
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
