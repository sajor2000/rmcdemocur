/**
 * Re-link extracted media files to their media_assets rows (populate
 * storage_path) without re-embedding or re-aligning. Run after
 * scripts/extract-docx-media.ts when the images were extracted AFTER the
 * documents were processed — upsertDocumentMediaAssets reads the on-disk files
 * and upserts storage_path onto the existing rows (matched by the media key),
 * so existing chunk_media links now resolve to real thumbnails.
 *
 * Caveat: upsertDocumentMediaAssets does a FULL figure-registry reconciliation,
 * not just a storage_path patch. Because the parse is deterministic this is a
 * no-op for the intended same-corpus re-link. But if the parser/registry has
 * drifted since the document was processed, rows whose key is no longer produced
 * are deleted (with their chunk_media links) and text_for_embed is refreshed
 * WITHOUT re-embedding — so run this only against the same parser version the
 * documents were processed with, and re-run db:process if the registry changed.
 *
 * Usage: npx tsx scripts/relink-media.ts
 */
import "./load-env";
import path from "path";
import { getDb } from "../lib/db";
import { documents } from "../drizzle/schema";
import { parseDocument } from "../lib/document-parser";
import { upsertDocumentMediaAssets } from "../lib/media-pipeline";

async function main() {
  const db = getDb();
  const docs = await db
    .select({
      id: documents.id,
      filename: documents.filename,
      fileType: documents.fileType,
      caseNumber: documents.caseNumber,
    })
    .from(documents)
    .orderBy(documents.caseNumber);

  let relinked = 0;
  for (const d of docs) {
    // Only DOCX faculty guides have extracted images today (PDF raster is Full-phase).
    if (!/FacultyGuide/i.test(d.filename) || !/\.docx$/i.test(d.filename)) continue;
    const parsed = await parseDocument(path.join(process.cwd(), "data/curriculum", d.filename));
    await upsertDocumentMediaAssets({
      documentId: d.id,
      filename: d.filename,
      fileType: (d.fileType as "pdf" | "docx" | "pptx") ?? "docx",
      caseNumber: d.caseNumber ?? 0,
      text: parsed.text,
    });
    console.log(`relinked media: ${d.filename}`);
    relinked++;
  }
  console.log(`\nRe-linked media for ${relinked} faculty guides.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
