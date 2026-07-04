import { eq, inArray, sql } from "drizzle-orm";
import { chunkMedia, figureCaptions, mediaAssets } from "@/drizzle/schema";
import { getDb } from "@/lib/db";
import {
  buildDocumentFigureMeta,
  buildFigureRegistry,
} from "@/lib/figure-registry";
import {
  enrichEmbedText,
  linkChunksToMedia,
} from "@/lib/media-linker";
import { listExtractedMediaFiles } from "@/lib/media-storage";
import type { DocumentFigureMeta, FigureRegistryEntry } from "@/lib/media-types";

const FACULTY_LINK_KINDS = new Set(["answer_image", "provided_image"]);

/** Map faculty answer-image rows to extracted files (last N images in DOCX order). */
export function assignFacultyAnswerImageStoragePaths(
  registry: FigureRegistryEntry[],
  extracted: { sourceIndex: number; storagePath: string }[],
): Map<number, string> {
  const answerRows = registry
    .filter((entry) => entry.referenceKind === "answer_image")
    .sort((a, b) => a.lineIndex - b.lineIndex);
  if (!answerRows.length || !extracted.length) return new Map();

  const sorted = [...extracted].sort((a, b) => a.sourceIndex - b.sourceIndex);
  if (sorted.length < answerRows.length) return new Map();

  const start = sorted.length - answerRows.length;
  const map = new Map<number, string>();
  answerRows.forEach((row, index) => {
    map.set(row.lineIndex, sorted[start + index]!.storagePath);
  });
  return map;
}

/** Shrunk to link cleanup only — media_assets rows are now managed by the
 * keyed upsert in upsertDocumentMediaAssets, which updates existing rows in
 * place and deletes only rows whose registry key vanished. See KTD5 in
 * docs/plans/2026-07-03-010-feat-deployment-readiness-hardening-plan.md. */
export async function clearDocumentMedia(documentId: number) {
  const db = getDb();
  const assets = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.documentId, documentId));

  for (const asset of assets) {
    await db.delete(chunkMedia).where(eq(chunkMedia.mediaAssetId, asset.id));
  }
}

function mediaAssetKey(
  label: string,
  referenceKind: string,
  sourceIndex: number | null,
): string {
  return `${label}::${referenceKind}::${sourceIndex ?? -1}`;
}

function captionKey(label: string, sourceIndex: number | null): string {
  return `${label}::${sourceIndex ?? -1}`;
}

export async function upsertDocumentMediaAssets(options: {
  documentId: number;
  filename: string;
  fileType: "pdf" | "docx" | "pptx";
  caseNumber: number;
  text: string;
}) {
  const db = getDb();
  const meta: DocumentFigureMeta = buildDocumentFigureMeta(
    options.filename,
    options.fileType,
    options.caseNumber,
  );
  const registry = buildFigureRegistry(options.text, meta);
  const extracted = await listExtractedMediaFiles(options.caseNumber, options.filename);
  const storageByIndex = new Map(extracted.map((row) => [row.sourceIndex, row.storagePath]));
  const facultyStorageByLine =
    meta.guideKind === "faculty" && meta.fileType === "docx"
      ? assignFacultyAnswerImageStoragePaths(registry, extracted)
      : new Map<number, string>();

  // Human-authored captions are an input, never a computed default — they
  // live in figure_captions (never wiped) and are merged here, upstream of
  // the embed stage (KTD3), so a caption correction always reaches chunk
  // embeddings instead of shipping stale ones.
  const captionRows = await db
    .select({
      label: figureCaptions.label,
      sourceIndex: figureCaptions.sourceIndex,
      textForEmbed: figureCaptions.textForEmbed,
    })
    .from(figureCaptions)
    .where(eq(figureCaptions.filename, options.filename));
  const captionByKey = new Map(
    captionRows.map((row) => [captionKey(row.label, row.sourceIndex), row.textForEmbed]),
  );

  const existingRows = await db
    .select({
      id: mediaAssets.id,
      label: mediaAssets.label,
      referenceKind: mediaAssets.referenceKind,
      sourceIndex: mediaAssets.sourceIndex,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.documentId, options.documentId));

  // A parser regression can yield a near-empty registry; refuse to treat that
  // as "every existing figure vanished" and mass-delete a document's media.
  if (registry.length === 0 && existingRows.length > 0) {
    throw new Error(
      `upsertDocumentMediaAssets: figure registry is empty for document ${options.documentId} ` +
        `but ${existingRows.length} media_assets row(s) already exist — refusing to delete them. ` +
        `This usually indicates a parser regression; investigate before reprocessing.`,
    );
  }

  const upserted: {
    id: number;
    label: string;
    textForEmbed: string | null;
    referenceKind: string;
    captionSource: string | null;
  }[] = [];

  for (const entry of registry) {
    let storagePath = facultyStorageByLine.get(entry.lineIndex) ?? null;
    if (
      !storagePath &&
      entry.sourceIndex != null &&
      entry.referenceKind !== "answer_image"
    ) {
      storagePath = storageByIndex.get(entry.sourceIndex) ?? null;
    }

    const captionOverride = captionByKey.get(captionKey(entry.label, entry.sourceIndex));
    const textForEmbed = captionOverride ?? entry.textForEmbed;
    const hasCaptionInText = captionOverride != null ? true : entry.hasCaptionInText;
    const captionSource = captionOverride != null ? "csv" : "text";

    // Drizzle 0.30's onConflictDoUpdate target only accepts plain columns, not
    // the expression index (COALESCE(source_index, -1)) media_assets_key_idx
    // is built on — raw SQL is the only way to express this ON CONFLICT target.
    const result = await db.execute(sql`
      INSERT INTO media_assets (
        document_id, type, label, section, reference_kind, has_caption_in_text,
        text_for_embed, storage_path, source_index, extraction_scope, video_url, caption_source
      ) VALUES (
        ${options.documentId}, ${entry.type}, ${entry.label}, ${entry.section}, ${entry.referenceKind},
        ${hasCaptionInText}, ${textForEmbed}, ${storagePath}, ${entry.sourceIndex},
        ${entry.extractionScope}, ${entry.videoUrl ?? null}, ${captionSource}
      )
      ON CONFLICT (document_id, label, reference_kind, (COALESCE(source_index, -1)))
      DO UPDATE SET
        type = EXCLUDED.type,
        section = EXCLUDED.section,
        has_caption_in_text = EXCLUDED.has_caption_in_text,
        text_for_embed = EXCLUDED.text_for_embed,
        storage_path = EXCLUDED.storage_path,
        extraction_scope = EXCLUDED.extraction_scope,
        video_url = EXCLUDED.video_url,
        caption_source = EXCLUDED.caption_source
      RETURNING id, label, text_for_embed AS "textForEmbed", reference_kind AS "referenceKind",
        caption_source AS "captionSource"
    `);
    const [row] = result.rows as {
      id: number;
      label: string;
      textForEmbed: string | null;
      referenceKind: string;
      captionSource: string | null;
    }[];
    upserted.push(row);
  }

  const registryKeys = new Set(
    registry.map((entry) => mediaAssetKey(entry.label, entry.referenceKind, entry.sourceIndex)),
  );
  const vanishedIds = existingRows
    .filter(
      (row) => !registryKeys.has(mediaAssetKey(row.label, row.referenceKind, row.sourceIndex)),
    )
    .map((row) => row.id);

  if (vanishedIds.length > 0) {
    // Links repointed away before rows deleted — chunk_media has no cascade.
    await db.delete(chunkMedia).where(inArray(chunkMedia.mediaAssetId, vanishedIds));
    await db.delete(mediaAssets).where(inArray(mediaAssets.id, vanishedIds));
  }

  return upserted;
}

export async function linkDocumentMediaToChunks(options: {
  documentId: number;
  chunks: { id: number; content: string; section: string | null }[];
}) {
  const db = getDb();
  const assets = await db
    .select({
      id: mediaAssets.id,
      label: mediaAssets.label,
      textForEmbed: mediaAssets.textForEmbed,
      referenceKind: mediaAssets.referenceKind,
      captionSource: mediaAssets.captionSource,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.documentId, options.documentId));

  const linkableAssets = assets.filter((asset) =>
    FACULTY_LINK_KINDS.has(asset.referenceKind),
  );
  const links = linkChunksToMedia(options.chunks, linkableAssets);
  for (const link of links) {
    await db.insert(chunkMedia).values(link).onConflictDoNothing();
  }
  return { assets, links };
}

export function buildEmbedTextForChunk(
  chunkContent: string,
  baseEmbedText: string,
  assets: { id: number; label: string; textForEmbed: string | null; referenceKind: string }[],
  linkedMediaIds: Set<number>,
): string {
  const linked = assets.filter((asset) => linkedMediaIds.has(asset.id));
  return enrichEmbedText(chunkContent, baseEmbedText, linked);
}

export function linkedMediaIdsForChunk(
  chunkId: number,
  links: { chunkId: number; mediaAssetId: number }[],
): Set<number> {
  return new Set(
    links.filter((link) => link.chunkId === chunkId).map((link) => link.mediaAssetId),
  );
}
