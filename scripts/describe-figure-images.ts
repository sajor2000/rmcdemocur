/**
 * Selective vision-OCR fallback for figures still missing a caption after
 * the CSV import (U7) and DOCX/PDF extraction (U8/U9) -- U10 in
 * docs/plans/2026-07-03-009-feat-curriculum-image-ingestion-plan.md.
 *
 * Scope is deliberately narrow: faculty answer_image rows only, unless
 * --include-self-study is passed to also cover self-study "figure" rows.
 * Never runs on the full corpus -- capped at VISION_OCR_MAX_IMAGES (default
 * 50) and refuses to process anything if the candidate count exceeds the
 * cap, rather than silently processing a partial batch.
 *
 * Usage:
 *   npx tsx scripts/describe-figure-images.ts
 *   npx tsx scripts/describe-figure-images.ts --include-self-study
 *   VISION_OCR_MAX_IMAGES=20 npx tsx scripts/describe-figure-images.ts
 */
import "./load-env";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { documents, mediaAssets } from "@/drizzle/schema";
import { getDb } from "@/lib/db";
import { resolveMediaKeyPath } from "@/lib/media-storage";
import { describeFigureImage } from "@/lib/vision-caption";
import fs from "fs/promises";
import path from "path";

const DEFAULT_MAX_IMAGES = 50;

export type DescribeFigureImagesSummary = {
  candidates: number;
  described: number;
  skippedNoContent: number;
  errors: { mediaAssetId: number; error: string }[];
};

export async function describeFigureImages(options?: {
  includeSelfStudy?: boolean;
  maxImages?: number;
}): Promise<DescribeFigureImagesSummary> {
  const includeSelfStudy = options?.includeSelfStudy ?? false;
  const maxImages = options?.maxImages ?? DEFAULT_MAX_IMAGES;

  const db = getDb();
  const referenceKindFilter = includeSelfStudy
    ? or(eq(mediaAssets.referenceKind, "answer_image"), eq(mediaAssets.referenceKind, "figure"))
    : eq(mediaAssets.referenceKind, "answer_image");

  const candidates = await db
    .select({
      id: mediaAssets.id,
      label: mediaAssets.label,
      storagePath: mediaAssets.storagePath,
      referenceKind: mediaAssets.referenceKind,
      filename: documents.filename,
    })
    .from(mediaAssets)
    .innerJoin(documents, eq(documents.id, mediaAssets.documentId))
    .where(
      and(
        referenceKindFilter,
        isNotNull(mediaAssets.storagePath),
        or(isNull(mediaAssets.textForEmbed), eq(mediaAssets.textForEmbed, "")),
      ),
    );

  // Fail loud rather than silently process a truncated batch -- an operator
  // who expected "run once, done" should not discover 30 of 80 rows were
  // quietly skipped. Re-run with a wider cap (or narrower scope) once seen.
  if (candidates.length > maxImages) {
    throw new Error(
      `describeFigureImages: ${candidates.length} candidate rows exceed the cap of ${maxImages} ` +
        `(VISION_OCR_MAX_IMAGES) -- refusing to process a partial batch. Narrow the scope or raise ` +
        `the cap explicitly before re-running.`,
    );
  }

  const summary: DescribeFigureImagesSummary = {
    candidates: candidates.length,
    described: 0,
    skippedNoContent: 0,
    errors: [],
  };

  for (const row of candidates) {
    try {
      const localPath = resolveMediaKeyPath(row.storagePath as string);
      if (!localPath) {
        summary.errors.push({ mediaAssetId: row.id, error: "storage_path resolved outside MEDIA_ROOT" });
        continue;
      }
      const bytes = await fs.readFile(localPath);
      const ext = path.extname(localPath).slice(1);
      const caption = await describeFigureImage(bytes, ext);

      if (caption === null) {
        summary.skippedNoContent += 1;
        continue;
      }

      await db
        .update(mediaAssets)
        .set({ textForEmbed: caption, captionSource: "vision" })
        .where(eq(mediaAssets.id, row.id));
      summary.described += 1;
    } catch (err) {
      summary.errors.push({
        mediaAssetId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

async function main() {
  const includeSelfStudy = process.argv.includes("--include-self-study");
  const maxImages = process.env.VISION_OCR_MAX_IMAGES
    ? Number.parseInt(process.env.VISION_OCR_MAX_IMAGES, 10)
    : DEFAULT_MAX_IMAGES;

  const summary = await describeFigureImages({ includeSelfStudy, maxImages });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length > 0) {
    console.warn(`${summary.errors.length} row(s) failed -- see errors above.`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
