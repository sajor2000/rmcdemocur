/**
 * Chunk-quality audit over the real curriculum documents.
 *
 * Runs the production parser + chunker over every document in data/curriculum
 * and reports the structural metrics the plan's Verification Contract gates on
 * (docs/plans/2026-07-03-007): section-size ceiling, mid-sentence boundary
 * rate, junk-chunk floor, and ToC leakage.
 *
 * Usage:
 *   npx tsx scripts/audit-chunks.ts          # report only
 *   npx tsx scripts/audit-chunks.ts --gate   # exit 1 when a gate fails
 */
import fs from "fs/promises";
import path from "path";
import { encode } from "gpt-tokenizer";
import { parseDocument } from "../lib/document-parser";
import { splitIntoSections, buildChunksFromDocument } from "../lib/chunker";

const CURRICULUM_DIR = path.join(process.cwd(), "data/curriculum");

// Verification Contract gates
const MAX_SECTION_TOKENS = 2000;
const MAX_MID_SENTENCE_RATE = 0.05;
const MIN_CHUNK_TOKENS = 40; // sole-chunk sections are whitelisted (chunker preserves them)
const TOC_FRAGMENT = /(?:\t\s*\d+|\.{2,}\s*\d+)\s*$/;

type DocReport = {
  file: string;
  error?: string;
  totalTokens?: number;
  sections?: number;
  largestSectionTokens?: number;
  chunks?: number;
  midSentenceBoundaryRate?: number;
  tinyChunks?: number; // sub-floor chunks NOT covered by the sole-chunk exception
  tocFragmentChunks?: number;
};

function endsMidSentence(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  return !/[.!?:;)\]"'”]$/.test(trimmed);
}

async function auditFile(filePath: string): Promise<DocReport> {
  const file = path.basename(filePath);
  let text: string;
  try {
    ({ text } = await parseDocument(filePath));
  } catch (error) {
    return { file, error: error instanceof Error ? error.message : String(error) };
  }

  const sections = splitIntoSections(text);
  const chunks = buildChunksFromDocument(text);
  const sectionTokens = sections.map((s) => encode(s.content).length);

  const chunksPerSection = new Map<string, number>();
  for (const c of chunks) {
    chunksPerSection.set(c.section, (chunksPerSection.get(c.section) ?? 0) + 1);
  }

  let midSentence = 0;
  let boundaries = 0;
  let tiny = 0;
  let tocFragments = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const next = chunks[i + 1];
    if (next && next.section === c.section) {
      boundaries++;
      if (endsMidSentence(c.content)) midSentence++;
    }
    const tokens = encode(c.content).length;
    const soleChunkOfSection = (chunksPerSection.get(c.section) ?? 0) === 1;
    if (tokens < MIN_CHUNK_TOKENS && !soleChunkOfSection) tiny++;
    if (TOC_FRAGMENT.test(c.content.trim()) && tokens < MIN_CHUNK_TOKENS) tocFragments++;
  }

  return {
    file,
    totalTokens: encode(text).length,
    sections: sections.length,
    largestSectionTokens: Math.max(...sectionTokens, 0),
    chunks: chunks.length,
    midSentenceBoundaryRate: boundaries ? Number((midSentence / boundaries).toFixed(3)) : 0,
    tinyChunks: tiny,
    tocFragmentChunks: tocFragments,
  };
}

async function main() {
  const gate = process.argv.includes("--gate");
  const files = (await fs.readdir(CURRICULUM_DIR))
    .filter((f) => /\.(pdf|docx|pptx)$/i.test(f))
    .sort();

  if (files.length === 0) {
    console.error(`No curriculum documents found in ${CURRICULUM_DIR}`);
    process.exit(gate ? 1 : 0);
  }

  const reports: DocReport[] = [];
  for (const f of files) {
    const report = await auditFile(path.join(CURRICULUM_DIR, f));
    reports.push(report);
    console.error(`audited: ${f}`);
  }

  console.log(JSON.stringify(reports, null, 2));

  const parsed = reports.filter((r) => !r.error);
  const failures: string[] = [];
  for (const r of parsed) {
    if ((r.largestSectionTokens ?? 0) > MAX_SECTION_TOKENS) {
      failures.push(`${r.file}: largest section ${r.largestSectionTokens} tokens > ${MAX_SECTION_TOKENS}`);
    }
    if ((r.midSentenceBoundaryRate ?? 0) > MAX_MID_SENTENCE_RATE) {
      failures.push(`${r.file}: mid-sentence boundary rate ${r.midSentenceBoundaryRate} > ${MAX_MID_SENTENCE_RATE}`);
    }
    if ((r.tinyChunks ?? 0) > 0) {
      failures.push(`${r.file}: ${r.tinyChunks} sub-${MIN_CHUNK_TOKENS}-token chunks outside the sole-chunk exception`);
    }
    if ((r.tocFragmentChunks ?? 0) > 0) {
      failures.push(`${r.file}: ${r.tocFragmentChunks} ToC fragment chunks`);
    }
  }
  for (const r of reports.filter((r) => r.error)) {
    console.error(`PARSE FAILURE (excluded from gates): ${r.file} — ${r.error}`);
  }

  if (failures.length) {
    console.error(`\nGATE ${gate ? "FAIL" : "WARN"}:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    if (gate) process.exit(1);
  } else {
    console.error("\nGATE PASS: all chunk-quality gates satisfied.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
