/**
 * Objective-coverage audit over the real curriculum documents.
 *
 * Parses every document in data/curriculum and reports how many learning
 * objectives the extractor finds per file. `--gate` fails when any *self-study*
 * guide yields zero objectives (self-study guides carry the student objectives;
 * faculty guides carry answer keys, so they are warning-only).
 *
 * Usage:
 *   npx tsx scripts/audit-objectives.ts          # report
 *   npx tsx scripts/audit-objectives.ts --gate   # exit 1 when a self-study guide has 0
 */
import "./load-env";
import fs from "fs/promises";
import path from "path";
import { parseDocument } from "../lib/document-parser";
import { extractObjectivesFromText } from "../lib/objective-extractor";

const CURRICULUM_DIR = path.join(process.cwd(), "data/curriculum");

/** Guides whose Case Specific Objectives section lists study topics (TO-####) only. */
const ZERO_OBJECTIVES_OK = new Set([
  "RMD563_SelfStudyGuide_Case3_MarieHernandez.docx",
]);

export type ObjectiveAuditRow = {
  file: string;
  isSelfStudy: boolean;
  objectives: number;
  toCoded: number;
};

/** A self-study guide with zero objectives is a gate failure unless the guide
 * only lists study topics (TO-####) under Case Specific Objectives. Faculty
 * guides are warning-only. Pure so it can be unit-tested without parsing. */
export function objectiveGateFailures(rows: ObjectiveAuditRow[]): string[] {
  return rows
    .filter(
      (r) =>
        r.isSelfStudy &&
        r.objectives === 0 &&
        !ZERO_OBJECTIVES_OK.has(r.file),
    )
    .map((r) => `${r.file}: self-study guide extracted 0 objectives`);
}

async function auditObjectives(): Promise<ObjectiveAuditRow[]> {
  const files = (await fs.readdir(CURRICULUM_DIR))
    .filter((f) => /\.(docx|pdf)$/i.test(f))
    .sort();
  const rows: ObjectiveAuditRow[] = [];
  for (const file of files) {
    const parsed = await parseDocument(path.join(CURRICULUM_DIR, file));
    const objs = extractObjectivesFromText(parsed.text);
    rows.push({
      file,
      isSelfStudy: /SelfStudy/i.test(file),
      objectives: objs.length,
      toCoded: objs.filter((o) => o.eoCode?.startsWith("TO-")).length,
    });
  }
  return rows;
}

async function main() {
  const gate = process.argv.includes("--gate");
  const rows = await auditObjectives();
  for (const r of rows) {
    const tag = r.isSelfStudy ? "self-study" : "faculty   ";
    console.log(`  [${tag}] ${r.file}: ${r.objectives} objectives (${r.toCoded} TO-coded)`);
  }
  const failures = objectiveGateFailures(rows);
  if (failures.length > 0) {
    console.error("\nObjective gate FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    if (gate) process.exit(1);
  } else {
    const topicOnly = rows.filter(
      (r) => r.isSelfStudy && r.objectives === 0 && ZERO_OBJECTIVES_OK.has(r.file),
    );
    if (topicOnly.length > 0) {
      console.log(
        `\nGATE PASS (${topicOnly.length} guide(s) list study topics only — no verb-based objectives).`,
      );
    } else {
      console.log("\nGATE PASS: every self-study guide has objectives.");
    }
  }
}

const isCli = path.basename(process.argv[1] ?? "") === "audit-objectives.ts";
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
