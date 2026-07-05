import fs from "fs/promises";
import path from "path";
import { put as blobPut } from "@vercel/blob";
import { FACULTY_GUIDES } from "./curriculum-sources";
import { extractAnswerImages } from "../lib/pdf-figure-images";
import {
  blobConfigured,
  mediaDirForDocument,
  mediaFilePath,
  mediaLocatorKey,
} from "../lib/media-storage";

export type PdfExtractReport = {
  filename: string;
  skippedReason?: string;
  extractedCount: number;
  outputDir?: string;
  blobUploadErrors?: { answerImageOrdinal: number; error: string }[];
};

/**
 * Extracts "Answer Image" figures from faculty PDFs (Cases 1-2, U9 in
 * docs/plans/2026-07-03-009-*) -- the only faculty guides that ship as PDF
 * rather than DOCX, where scripts/extract-docx-media.ts's zip-based
 * extraction doesn't apply. Small volume (26 images total across both
 * files), so unlike U8's self-study figures this always uploads to Blob
 * when configured, matching scripts/extract-docx-media.ts's faculty
 * behavior rather than U8's deliberately-deferred self-study exception.
 */
export async function extractPdfMedia(options?: {
  curriculumDir?: string;
}): Promise<PdfExtractReport[]> {
  const curriculumDir = options?.curriculumDir ?? path.join(process.cwd(), "data/curriculum");
  const targets = FACULTY_GUIDES.filter((f) => f.dest.endsWith(".pdf"));
  const reports: PdfExtractReport[] = [];
  const uploadToBlob = blobConfigured();

  for (const mapping of targets) {
    const filename = mapping.dest;
    const filePath = path.join(curriculumDir, filename);

    try {
      await fs.access(filePath);
    } catch {
      reports.push({ filename, skippedReason: "missing-file", extractedCount: 0 });
      continue;
    }

    const outDir = mediaDirForDocument(mapping.caseNumber, filename);
    await fs.mkdir(outDir, { recursive: true });

    const buffer = await fs.readFile(filePath);
    const images = await extractAnswerImages(buffer);

    let extractedCount = 0;
    const blobUploadErrors: { answerImageOrdinal: number; error: string }[] = [];

    for (const img of images) {
      const destPath = mediaFilePath(mapping.caseNumber, filename, img.answerImageOrdinal, img.ext);
      const existingStat = await fs.stat(destPath).catch(() => null);
      if (!existingStat || existingStat.size !== img.bytes.length) {
        await fs.writeFile(destPath, img.bytes);
      }
      extractedCount += 1;

      if (uploadToBlob) {
        const key = mediaLocatorKey(mapping.caseNumber, filename, img.answerImageOrdinal, img.ext);
        try {
          await blobPut(key, img.bytes, { access: "private", allowOverwrite: true });
        } catch (err) {
          blobUploadErrors.push({
            answerImageOrdinal: img.answerImageOrdinal,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    reports.push({
      filename,
      extractedCount,
      outputDir: outDir,
      ...(blobUploadErrors.length > 0 ? { blobUploadErrors } : {}),
    });
  }

  return reports;
}

async function main() {
  const reports = await extractPdfMedia();
  console.log(JSON.stringify({ reports }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
