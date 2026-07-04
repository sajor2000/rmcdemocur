/**
 * Figure coverage audit for curriculum documents.
 *
 * Usage:
 *   npx tsx scripts/audit-figures.ts
 *   npx tsx scripts/audit-figures.ts --gate
 */
import fs from "fs/promises";
import path from "path";
import { parseDocument } from "../lib/document-parser";
import {
  buildDocumentFigureMeta,
  buildFigureRegistry,
} from "../lib/figure-registry";
import { listExtractedMediaFiles } from "../lib/media-storage";
import { FACULTY_GUIDES, SELF_STUDY_GUIDES } from "./curriculum-sources";

const CURRICULUM_DIR = path.join(process.cwd(), "data/curriculum");

type DocFigureReport = {
  file: string;
  guideKind: "faculty" | "self_study";
  fileType: string;
  registryCount: number;
  answerImageCount: number;
  imageOnlyWarnings: number;
  gateFailures: string[];
  warnings: string[];
};

function isFacultyFile(filename: string): boolean {
  return FACULTY_GUIDES.some((f) => f.dest === filename);
}

export async function auditFigureFile(filePath: string): Promise<DocFigureReport> {
  const filename = path.basename(filePath);
  const parsed = await parseDocument(filePath);
  const mapping =
    FACULTY_GUIDES.find((f) => f.dest === filename) ??
    SELF_STUDY_GUIDES.find((f) => f.dest === filename);
  const caseNumber = mapping?.caseNumber ?? 0;
  const meta = buildDocumentFigureMeta(filename, parsed.fileType, caseNumber);
  const registry = buildFigureRegistry(parsed.text, meta);
  const extracted = await listExtractedMediaFiles(caseNumber, filename);
  const storageByIndex = new Map(extracted.map((row) => [row.sourceIndex, row.storagePath]));

  const gateFailures: string[] = [];
  const warnings: string[] = [];
  let imageOnlyWarnings = 0;

  for (const entry of registry) {
    const storagePath =
      entry.sourceIndex != null ? storageByIndex.get(entry.sourceIndex) ?? null : null;
    const hasText = Boolean(entry.textForEmbed?.trim());
    const hasFile = Boolean(storagePath);

    if (entry.referenceKind === "answer_image" && meta.guideKind === "faculty") {
      if (!hasText && !hasFile) {
        gateFailures.push(`${entry.label} missing caption text and extracted file`);
      }
    }

    if (
      entry.referenceKind === "figure" &&
      !entry.hasCaptionInText &&
      meta.guideKind === "self_study"
    ) {
      imageOnlyWarnings += 1;
      warnings.push(`${entry.label} image-only (self-study warning)`);
    }
  }

  return {
    file: filename,
    guideKind: meta.guideKind,
    fileType: parsed.fileType,
    registryCount: registry.length,
    answerImageCount: registry.filter((r) => r.referenceKind === "answer_image").length,
    imageOnlyWarnings,
    gateFailures,
    warnings,
  };
}

export async function auditAllFigures(curriculumDir = CURRICULUM_DIR) {
  const files = (await fs.readdir(curriculumDir))
    .filter((name) => /\.(docx|pdf)$/i.test(name))
    .sort();
  const reports: DocFigureReport[] = [];
  for (const file of files) {
    reports.push(await auditFigureFile(path.join(curriculumDir, file)));
  }
  return reports;
}

async function main() {
  const gate = process.argv.includes("--gate");
  const reports = await auditAllFigures();
  const gateFailures = reports.flatMap((report) =>
    isFacultyFile(report.file) ? report.gateFailures.map((msg) => `${report.file}: ${msg}`) : [],
  );

  console.log(
    JSON.stringify(
      {
        documents: reports.length,
        totalRegistryRows: reports.reduce((sum, r) => sum + r.registryCount, 0),
        totalAnswerImages: reports.reduce((sum, r) => sum + r.answerImageCount, 0),
        totalImageOnlyWarnings: reports.reduce((sum, r) => sum + r.imageOnlyWarnings, 0),
        gateFailures,
        reports,
      },
      null,
      2,
    ),
  );

  if (gate && gateFailures.length) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
