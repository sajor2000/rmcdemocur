import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { put as blobPut } from "@vercel/blob";
import { FACULTY_GUIDES, SELF_STUDY_GUIDES } from "./curriculum-sources";
import { parseDocument } from "../lib/document-parser";
import {
  buildDocumentFigureMeta,
  buildFigureRegistry,
} from "../lib/figure-registry";
import { extractLabeledFigureImages } from "../lib/docx-figure-images";
import {
  blobConfigured,
  mediaDirForDocument,
  mediaFilePath,
  mediaLocatorKey,
} from "../lib/media-storage";

const execFileAsync = promisify(execFile);

export type ExtractScope = "faculty" | "self_study" | "all";

export type ExtractReport = {
  filename: string;
  skippedReason?: string;
  extractedCount: number;
  outputDir?: string;
  blobUploadErrors?: { sourceIndex: number; error: string }[];
};

export function resolveExtractTargets(scope: ExtractScope): string[] {
  if (scope === "faculty") {
    return FACULTY_GUIDES.map((f) => f.dest).filter((name) => name.endsWith(".docx"));
  }
  if (scope === "self_study") {
    return SELF_STUDY_GUIDES.map((f) => f.dest);
  }
  return [...FACULTY_GUIDES, ...SELF_STUDY_GUIDES]
    .map((f) => f.dest)
    .filter((name) => name.endsWith(".docx"));
}

async function listDocxMediaEntries(docxPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("unzip", ["-Z1", docxPath]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("word/media/") && !line.endsWith("/"));
}

export async function extractDocxMedia(options?: {
  scope?: ExtractScope;
  curriculumDir?: string;
}): Promise<ExtractReport[]> {
  const scope = options?.scope ?? "faculty";
  const curriculumDir = options?.curriculumDir ?? path.join(process.cwd(), "data/curriculum");
  const targets = resolveExtractTargets(scope);
  const reports: ExtractReport[] = [];

  for (const filename of targets) {
    const filePath = path.join(curriculumDir, filename);
    if (!filename.endsWith(".docx")) {
      reports.push({ filename, skippedReason: "not-docx", extractedCount: 0 });
      continue;
    }

    try {
      await fs.access(filePath);
    } catch {
      reports.push({ filename, skippedReason: "missing-file", extractedCount: 0 });
      continue;
    }

    const mapping =
      FACULTY_GUIDES.find((f) => f.dest === filename) ??
      SELF_STUDY_GUIDES.find((f) => f.dest === filename);
    if (!mapping) {
      reports.push({ filename, skippedReason: "unknown-mapping", extractedCount: 0 });
      continue;
    }

    const outDir = mediaDirForDocument(mapping.caseNumber, filename);
    await fs.mkdir(outDir, { recursive: true });

    const isSelfStudy = SELF_STUDY_GUIDES.some((f) => f.dest === filename);
    if (isSelfStudy) {
      // Full phase (U8): only the labeled figures are worth extracting — most
      // self-study images are unlabeled slide screenshots with no registry
      // row and nowhere to display them (docs/plans/2026-07-03-009-*, U8).
      // Labeled-figure position doesn't reliably match the docx zip's raw
      // media-entry order (verified: 384/391 mismatched in a real guide), so
      // this correlates by document position via mammoth instead of the raw
      // zip loop below, which stays faculty-only and unchanged.
      //
      // Blob upload is deliberately NOT attempted for self-study yet — a
      // separate storage-cost decision, not a bug: only ~120 of thousands of
      // self-study images are ever displayable, and Blob upload should wait
      // until self-study figures are confirmed needed in the live demo.
      const buffer = await fs.readFile(filePath);
      const images = await extractLabeledFigureImages(buffer);
      let extractedCount = 0;
      for (const img of images) {
        const destPath = mediaFilePath(mapping.caseNumber, filename, img.figureOrdinal, img.ext);
        const existingStat = await fs.stat(destPath).catch(() => null);
        if (existingStat && existingStat.size === img.bytes.length) {
          extractedCount += 1;
          continue;
        }
        await fs.writeFile(destPath, img.bytes);
        extractedCount += 1;
      }
      reports.push({ filename, extractedCount, outputDir: outDir });
      continue;
    }

    const mediaEntries = await listDocxMediaEntries(filePath);
    let extractedCount = 0;
    const blobUploadErrors: { sourceIndex: number; error: string }[] = [];
    const uploadToBlob = blobConfigured();
    for (let i = 0; i < mediaEntries.length; i++) {
      const entry = mediaEntries[i];
      const ext = path.extname(entry).slice(1) || "bin";
      const sourceIndex = i + 1;
      const destPath = mediaFilePath(mapping.caseNumber, filename, sourceIndex, ext);

      let bytes: Buffer | null = null;
      let locallyCached = false;
      try {
        const [existingStat, zipStat] = await Promise.all([
          fs.stat(destPath).catch(() => null),
          fs.stat(filePath),
        ]);
        if (
          existingStat &&
          existingStat.size > 0 &&
          existingStat.mtimeMs >= zipStat.mtimeMs
        ) {
          locallyCached = true;
        }
      } catch {
        // extract below
      }

      if (!locallyCached) {
        // encoding:"buffer" is load-bearing: the default utf8 decode corrupts binary
        // image bytes (0x89504e47 PNG magic round-trips to efbfbd... replacement chars).
        const { stdout } = await execFileAsync("unzip", ["-p", filePath, entry], {
          maxBuffer: 20 * 1024 * 1024,
          encoding: "buffer",
        });
        bytes = stdout as unknown as Buffer;
        await fs.writeFile(destPath, bytes);
      }
      extractedCount += 1;

      // Attempted every time uploadToBlob is true, even when local extraction
      // was skipped as already-cached — otherwise enabling Blob after a
      // local-only extraction (the normal dev-then-deploy sequence) would
      // permanently skip every already-extracted file's upload.
      if (uploadToBlob) {
        const key = mediaLocatorKey(mapping.caseNumber, filename, sourceIndex, ext);
        try {
          bytes ??= await fs.readFile(destPath);
          await blobPut(key, bytes, {
            access: "private",
            allowOverwrite: true,
          });
        } catch (err) {
          // Local extraction already succeeded and must not be undone by an
          // upload failure — report per-file so a forgotten/failed upload is
          // diagnosable (surfaces again as a 404 at serve time, see R6).
          blobUploadErrors.push({
            sourceIndex,
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

export async function buildRegistryForFile(filePath: string) {
  const filename = path.basename(filePath);
  const parsed = await parseDocument(filePath);
  const mapping =
    FACULTY_GUIDES.find((f) => f.dest === filename) ??
    SELF_STUDY_GUIDES.find((f) => f.dest === filename);
  const caseNumber = mapping?.caseNumber ?? 0;
  const meta = buildDocumentFigureMeta(filename, parsed.fileType, caseNumber);
  return buildFigureRegistry(parsed.text, meta);
}

async function main() {
  const scopeArg = process.argv.find((arg) => arg.startsWith("--scope="));
  const scope = (scopeArg?.split("=")[1] as ExtractScope | undefined) ?? "faculty";
  const reports = await extractDocxMedia({ scope });
  console.log(JSON.stringify({ scope, reports }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
