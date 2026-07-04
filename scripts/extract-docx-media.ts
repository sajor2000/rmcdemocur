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

    const mediaEntries = await listDocxMediaEntries(filePath);
    const outDir = mediaDirForDocument(mapping.caseNumber, filename);
    await fs.mkdir(outDir, { recursive: true });

    let extractedCount = 0;
    const blobUploadErrors: { sourceIndex: number; error: string }[] = [];
    const uploadToBlob = blobConfigured();
    for (let i = 0; i < mediaEntries.length; i++) {
      const entry = mediaEntries[i];
      const ext = path.extname(entry).slice(1) || "bin";
      const sourceIndex = i + 1;
      const destPath = mediaFilePath(mapping.caseNumber, filename, sourceIndex, ext);

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
          extractedCount += 1;
          continue;
        }
      } catch {
        // extract below
      }

      // encoding:"buffer" is load-bearing: the default utf8 decode corrupts binary
      // image bytes (0x89504e47 PNG magic round-trips to efbfbd... replacement chars).
      const { stdout } = await execFileAsync("unzip", ["-p", filePath, entry], {
        maxBuffer: 20 * 1024 * 1024,
        encoding: "buffer",
      });
      await fs.writeFile(destPath, stdout as unknown as Buffer);
      extractedCount += 1;

      if (uploadToBlob) {
        const key = mediaLocatorKey(mapping.caseNumber, filename, sourceIndex, ext);
        try {
          await blobPut(key, stdout as unknown as Buffer, {
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
