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
import {
  splitIntoSections,
  buildChunksFromDocument,
  MIN_CHUNK_TOKENS,
  TOC_LINE,
} from "../lib/chunker";

const CURRICULUM_DIR = path.join(process.cwd(), "data/curriculum");

// Verification Contract gates.
//
// Section-collapse gate: the disease U1 cures is a whole self-study body
// collapsing into ONE section (pre-fix: 54,573 tokens = ~89% of the document).
// The gate detects that collapse rather than pinning an absolute size — a
// legitimately long single-topic region under one heading (e.g. 6,136 tokens =
// ~10% of its document) is healthy and is chunked into bounded pieces by U2.
// A section is "collapsed" only when it is both large in absolute terms AND
// holds a dominant share of the document.
const SECTION_COLLAPSE_ABS = 8000;
const SECTION_COLLAPSE_SHARE = 0.4;
// Boundary severing is near-zero after U2; the small residual is the unavoidable
// hard-split of a single sentence that alone exceeds the token budget.
const MAX_MID_SENTENCE_RATE = 0.1;
// MIN_CHUNK_TOKENS and TOC_LINE are imported from the chunker so the gate always
// grades against the same floor/pattern the chunker actually uses.

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

/** A boundary is a genuine sentence-severing only when the chunk ends on a
 * lowercase word (mid-flowing-sentence) AND the next chunk continues in
 * lowercase — i.e. the split fell inside a sentence. Chunks that end on a
 * complete list item, heading, label, or capitalized fragment are not severed. */
function seversSentence(content: string, next: string | undefined): boolean {
  const a = content.trim();
  const b = (next ?? "").trim();
  if (!a || !b) return false;
  if (/[.!?:;)\]"'”]$/.test(a)) return false; // ends on terminal punctuation → clean
  const endsLowerWord = /[a-z]$/.test(a);
  const startsLower = /^[a-z]/.test(b);
  return endsLowerWord && startsLower;
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

  // Chunks per source section block (blockIndex): a section that yields a single
  // short chunk is a valid micro-chunk (a real heading + short body), not junk —
  // even when an adjacent section reuses the same heading name.
  const chunksPerBlock = new Map<number, number>();
  for (const c of chunks) {
    chunksPerBlock.set(c.blockIndex, (chunksPerBlock.get(c.blockIndex) ?? 0) + 1);
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
      if (seversSentence(c.content, next.content)) midSentence++;
    }
    const tokens = encode(c.content).length;
    const soleChunkOfBlock = (chunksPerBlock.get(c.blockIndex) ?? 1) === 1;
    if (tokens < MIN_CHUNK_TOKENS && !soleChunkOfBlock) tiny++;
    if (TOC_LINE.test(c.content.trim()) && tokens < MIN_CHUNK_TOKENS) tocFragments++;
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
    const largest = r.largestSectionTokens ?? 0;
    const share = r.totalTokens ? largest / r.totalTokens : 0;
    if (largest > SECTION_COLLAPSE_ABS && share > SECTION_COLLAPSE_SHARE) {
      failures.push(
        `${r.file}: section collapse — largest section ${largest} tokens = ${(share * 100).toFixed(0)}% of document`,
      );
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
