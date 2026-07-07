import "./load-env";
import fs from "fs/promises";
import path from "path";
import { sql } from "drizzle-orm";
import { getDb } from "../lib/db";

/**
 * Logical backup of the two tables a Phase-B USMLE re-seed + re-align destroys:
 * usmle_domains (with embeddings, dumped as pgvector text) and alignments.
 * Written to data/backups/ (gitignored). Restore with scripts/restore-taxonomy.ts.
 * pg_dump is unavailable in this environment, so this is the snapshot mechanism.
 */
const BACKUP_DIR = path.join(process.cwd(), "data", "backups");
const BACKUP_FILE = path.join(BACKUP_DIR, "phase-b-usmle-backup.json");

async function main() {
  const db = getDb();
  const usmle = await db.execute(sql`
    SELECT id, step, category, domain, subdomain, stable_id, full_text,
           parent_stable_id, source_doc, embedding::text AS embedding
    FROM usmle_domains ORDER BY id
  `);
  const alignments = await db.execute(sql`
    SELECT id, chunk_id, framework, framework_id, framework_label,
           confidence::text AS confidence, rationale, status, created_at
    FROM alignments ORDER BY id
  `);

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const payload = {
    takenAtNote: "Phase B pre-migration backup (usmle_domains + alignments)",
    usmleDomains: usmle.rows,
    alignments: alignments.rows,
  };
  await fs.writeFile(BACKUP_FILE, JSON.stringify(payload));

  const embedded = (usmle.rows as { embedding: string | null }[]).filter((r) => r.embedding).length;
  console.log(`Backup written: ${BACKUP_FILE}`);
  console.log(`  usmle_domains: ${usmle.rows.length} rows (${embedded} with embeddings)`);
  console.log(`  alignments:    ${alignments.rows.length} rows`);
  // integrity: re-read and confirm parseable + counts match
  const reread = JSON.parse(await fs.readFile(BACKUP_FILE, "utf8"));
  const ok = reread.usmleDomains.length === usmle.rows.length && reread.alignments.length === alignments.rows.length;
  console.log(ok ? "Integrity check PASSED (file re-reads with matching counts)." : "INTEGRITY CHECK FAILED");
  if (!ok) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
