import { eq } from "drizzle-orm";
import { chunkMedia, mediaAssets } from "@/drizzle/schema";
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

export async function clearDocumentMedia(documentId: number) {
  const db = getDb();
  const assets = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.documentId, documentId));

  for (const asset of assets) {
    await db.delete(chunkMedia).where(eq(chunkMedia.mediaAssetId, asset.id));
  }
  await db.delete(mediaAssets).where(eq(mediaAssets.documentId, documentId));
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

  const inserted: { id: number; label: string; textForEmbed: string | null; referenceKind: string }[] =
    [];

  for (const entry of registry) {
    let storagePath = facultyStorageByLine.get(entry.lineIndex) ?? null;
    if (
      !storagePath &&
      entry.sourceIndex != null &&
      entry.referenceKind !== "answer_image"
    ) {
      storagePath = storageByIndex.get(entry.sourceIndex) ?? null;
    }
    const [row] = await db
      .insert(mediaAssets)
      .values({
        documentId: options.documentId,
        type: entry.type,
        label: entry.label,
        section: entry.section,
        referenceKind: entry.referenceKind,
        hasCaptionInText: entry.hasCaptionInText,
        textForEmbed: entry.textForEmbed,
        storagePath,
        sourceIndex: entry.sourceIndex,
        extractionScope: entry.extractionScope,
        videoUrl: entry.videoUrl ?? null,
      })
      .returning({
        id: mediaAssets.id,
        label: mediaAssets.label,
        textForEmbed: mediaAssets.textForEmbed,
        referenceKind: mediaAssets.referenceKind,
      });
    inserted.push(row);
  }

  return inserted;
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
