/**
 * Import official figure captions from CSV into the figure_captions input
 * table. Captions live here — not in media_assets — so a rebuild (which
 * regenerates media_assets from document text) never destroys them; see
 * KTD3 in docs/plans/2026-07-03-010-feat-deployment-readiness-hardening-plan.md.
 * Upsert-on-key semantics (filename, label, source_index) make re-running
 * this importer with a corrected CSV safe at any time — the document
 * doesn't need to exist yet for its captions to be imported.
 *
 * CSV columns: filename, label, text_for_embed, storage_index (optional)
 *
 * Usage:
 *   npx tsx scripts/import-figure-captions.ts data/curriculum/figure-captions.csv
 */
import "./load-env";
import fs from "fs/promises";
import { sql } from "drizzle-orm";
import { parseCsvRows } from "@/lib/csv-parse";
import { getDb } from "@/lib/db";

export type CaptionRow = {
  filename: string;
  label: string;
  textForEmbed: string;
  storageIndex: number | null;
};

export function parseFigureCaptionRows(content: string): CaptionRow[] {
  const rows = parseCsvRows(content);
  if (!rows.length) return [];

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const filenameIdx = header.indexOf("filename");
  const labelIdx = header.indexOf("label");
  const textIdx = header.indexOf("text_for_embed");
  const storageIdx = header.indexOf("storage_index");

  if (filenameIdx < 0 || labelIdx < 0 || textIdx < 0) {
    throw new Error("CSV must include filename,label,text_for_embed columns");
  }

  return rows.slice(1).map((cells) => {
    const storageRaw = storageIdx >= 0 ? cells[storageIdx]?.trim() : "";
    const storageIndex =
      storageRaw && Number.isFinite(Number(storageRaw)) ? Number(storageRaw) : null;
    return {
      filename: cells[filenameIdx] ?? "",
      label: cells[labelIdx] ?? "",
      textForEmbed: cells[textIdx] ?? "",
      storageIndex,
    };
  });
}

export async function importFigureCaptions(csvPath: string) {
  const db = getDb();
  const content = await fs.readFile(csvPath, "utf8");
  const rows = parseFigureCaptionRows(content);
  const summary = { upserted: 0, skipped: 0 };

  for (const row of rows) {
    if (!row.filename || !row.label || !row.textForEmbed) {
      summary.skipped += 1;
      continue;
    }

    await db.execute(sql`
      INSERT INTO figure_captions (filename, label, text_for_embed, source_index, updated_at)
      VALUES (${row.filename}, ${row.label}, ${row.textForEmbed}, ${row.storageIndex}, now())
      ON CONFLICT (filename, label, (COALESCE(source_index, -1)))
      DO UPDATE SET text_for_embed = EXCLUDED.text_for_embed, updated_at = now()
    `);
    summary.upserted += 1;
  }

  return summary;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import-figure-captions.ts <csv-path>");
    process.exit(1);
  }
  const summary = await importFigureCaptions(csvPath);
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
