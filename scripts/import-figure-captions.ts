/**
 * Import official figure captions from CSV.
 *
 * CSV columns: filename, label, text_for_embed, storage_index (optional)
 *
 * Usage:
 *   npx tsx scripts/import-figure-captions.ts data/curriculum/figure-captions.csv
 */
import fs from "fs/promises";
import { eq } from "drizzle-orm";
import { documents, mediaAssets } from "@/drizzle/schema";
import { parseCsvRows } from "@/lib/csv-parse";
import { getDb } from "@/lib/db";
import { listExtractedMediaFiles } from "@/lib/media-storage";

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
  const summary = { updated: 0, skipped: 0, missingDocument: 0, missingAsset: 0 };

  for (const row of rows) {
    if (!row.filename || !row.label || !row.textForEmbed) {
      summary.skipped += 1;
      continue;
    }

    const [doc] = await db
      .select({ id: documents.id, caseNumber: documents.caseNumber })
      .from(documents)
      .where(eq(documents.filename, row.filename))
      .limit(1);
    if (!doc) {
      summary.missingDocument += 1;
      continue;
    }

    const assets = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.documentId, doc.id));

    const match = assets.find(
      (asset) => asset.label.toLowerCase() === row.label.toLowerCase(),
    );
    if (!match) {
      summary.missingAsset += 1;
      continue;
    }

    let storagePath = match.storagePath;
    if (row.storageIndex != null && doc.caseNumber != null) {
      const extracted = await listExtractedMediaFiles(doc.caseNumber, row.filename);
      storagePath =
        extracted.find((file) => file.sourceIndex === row.storageIndex)?.storagePath ??
        storagePath;
    }

    await db
      .update(mediaAssets)
      .set({
        textForEmbed: row.textForEmbed,
        hasCaptionInText: true,
        storagePath,
        sourceIndex: row.storageIndex ?? match.sourceIndex,
      })
      .where(eq(mediaAssets.id, match.id));
    summary.updated += 1;
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
