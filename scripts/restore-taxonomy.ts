import "./load-env";
import fs from "fs/promises";
import path from "path";
import { sql } from "drizzle-orm";
import { getDb } from "../lib/db";

/**
 * Restore usmle_domains + alignments from the Phase-B logical backup
 * (scripts/backup-taxonomy.ts). Rollback path for a failed re-seed/re-align:
 * deletes the current rows and re-inserts the backed-up ones (embeddings and
 * confidence restored via ::vector / ::numeric casts). Requires --confirm.
 */
const BACKUP_FILE = path.join(process.cwd(), "data", "backups", "phase-b-usmle-backup.json");

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("Refusing to restore without --confirm (this deletes and replaces usmle_domains + alignments).");
    process.exit(1);
  }
  const db = getDb();
  const payload = JSON.parse(await fs.readFile(BACKUP_FILE, "utf8")) as {
    usmleDomains: Record<string, unknown>[];
    alignments: Record<string, unknown>[];
  };

  await db.execute(sql`DELETE FROM alignments`);
  await db.execute(sql`DELETE FROM usmle_domains`);

  for (const r of payload.usmleDomains) {
    const emb = r.embedding as string | null;
    await db.execute(sql`
      INSERT INTO usmle_domains (id, step, category, domain, subdomain, stable_id, full_text, parent_stable_id, source_doc, embedding)
      VALUES (${r.id}, ${r.step}, ${r.category}, ${r.domain}, ${r.subdomain}, ${r.stable_id}, ${r.full_text}, ${r.parent_stable_id}, ${r.source_doc},
              ${emb ? sql`${emb}::vector` : sql`NULL`})
    `);
  }
  for (const r of payload.alignments) {
    const conf = r.confidence as string | null;
    await db.execute(sql`
      INSERT INTO alignments (id, chunk_id, framework, framework_id, framework_label, confidence, rationale, status, created_at)
      VALUES (${r.id}, ${r.chunk_id}, ${r.framework}, ${r.framework_id}, ${r.framework_label},
              ${conf ? sql`${conf}::numeric` : sql`NULL`}, ${r.rationale}, ${r.status}, ${r.created_at})
    `);
  }
  await db.execute(sql`SELECT setval('usmle_domains_id_seq', (SELECT COALESCE(MAX(id),1) FROM usmle_domains))`);
  await db.execute(sql`SELECT setval('alignments_id_seq', (SELECT COALESCE(MAX(id),1) FROM alignments))`);
  console.log(`Restored ${payload.usmleDomains.length} usmle_domains + ${payload.alignments.length} alignments.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
