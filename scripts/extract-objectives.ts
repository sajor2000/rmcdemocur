/**
 * Batch-extract learning objectives from all F2F curriculum materials.
 * Regex-first; LLM cleanup only when configured and needed.
 *
 * Usage: npx tsx scripts/extract-objectives.ts
 */
import fs from "fs/promises";
import path from "path";
import { parseDocument } from "../lib/document-parser";
import { extractAndCleanObjectives } from "../lib/objective-cleanup";

const F2F_DIR = path.join(
  process.cwd(),
  "2026 Curriculum Inventory Project F2F materials",
);

const EXTENSIONS = new Set([".pdf", ".docx"]);

async function main() {
  let entries: string[];
  try {
    entries = await fs.readdir(F2F_DIR);
  } catch {
    console.error(`F2F materials folder not found: ${F2F_DIR}`);
    process.exit(1);
  }

  const files = entries
    .filter((f) => EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort();

  let totalObjectives = 0;
  const report: {
    file: string;
    sectionsFound: number;
    objectiveCount: number;
    llmUsed: boolean;
    objectives: string[];
  }[] = [];

  for (const file of files) {
    const filePath = path.join(F2F_DIR, file);
    try {
      const parsed = await parseDocument(filePath);
      const result = await extractAndCleanObjectives(parsed.text);
      totalObjectives += result.objectives.length;
      report.push({
        file,
        sectionsFound: result.sectionsFound,
        objectiveCount: result.objectives.length,
        llmUsed: result.llmUsed,
        objectives: result.objectives.map((o) => o.text),
      });
      console.log(
        `${file}: ${result.objectives.length} objectives (${result.sectionsFound} sections${result.llmUsed ? ", LLM cleanup" : ""})`,
      );
    } catch (err) {
      console.warn(`Skip ${file}:`, err instanceof Error ? err.message : err);
    }
  }

  const outPath = path.join(process.cwd(), "data/objectives-extraction-report.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ totalObjectives, report }, null, 2));
  console.log(`\nTotal: ${totalObjectives} objectives from ${report.length} files`);
  console.log(`Report written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
