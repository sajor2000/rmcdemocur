import { encode, decode } from "gpt-tokenizer";

export type SectionBlock = {
  section: string;
  content: string;
};

const SECTION_PATTERNS = [
  /^Activity\s+\d+[A-Z]?:.*$/i,
  /^Take-Home Points.*$/i,
  /^Case\s+\d+.*$/i,
  /^Learning Objectives.*$/i,
  /^Objectives.*$/i,
  // Self-study guide vocabulary (named headings may carry inline content, e.g. "Key Words: insulin")
  /^Self-Study Topics\b.*$/i,
  /^Discipline Director Notes?\b.*$/i,
  /^Rationale\s*:.*$/i,
  /^Key (Words|Points)\b.*$/i,
  /^Overview\s*:?$/i,
  /^Summary\s*:?$/i,
  /^Resource Materials?\b.*$/i,
  /^References\s*$/i,
  /^Question\s+\d+\b.*$/i,
];

// Generic "Short Title:" heading — trailing colon only; inline-content detection is
// reserved for the named vocabulary above to avoid splitting ordinary prose.
const TRAILING_COLON_HEADING = /^[A-Z][A-Za-z0-9 ,&/()'-]{2,60}:$/;

// Interstitial labels that end in a colon but must stay inside their section —
// promoting them to headings would mislabel the breadcrumb for everything after.
const HEADING_STOPLIST = new Set([
  "answer",
  "answer image",
  "answer with answer image",
  "provided image",
  "note",
  "for example",
  "example",
  "incorrect options",
  "vital signs",
  "instructions",
  "faculty contact",
  "faculty contacts",
]);

const MAX_HEADING_LENGTH = 80;
// ToC lines ("Heading<TAB>14" / "Heading....14") only count near the document head,
// so tab-separated table rows deeper in the body (e.g. lab values) survive.
const TOC_LINE = /(?:\t\s*\d+|\.{2,}\s*\d+)\s*$/;
const TOC_SCAN_LINES = 300;
const TOC_MIN_RUN = 3;

function isStoplisted(line: string): boolean {
  const label = line.replace(/:.*$/, "").trim().toLowerCase();
  return HEADING_STOPLIST.has(label);
}

function isHeadingLine(line: string): boolean {
  if (!line || line.length > MAX_HEADING_LENGTH) return false;
  if (isStoplisted(line)) return false;
  if (SECTION_PATTERNS.some((p) => p.test(line))) return true;
  return TRAILING_COLON_HEADING.test(line);
}

/** Remove a table-of-contents region (>=TOC_MIN_RUN page-numbered lines near the head).
 * Only the leading cluster of ToC-like lines is stripped — a gap of more than
 * TOC_MAX_GAP non-matching lines ends the region, so tab-separated table rows
 * later in the body (e.g. lab values) survive. */
const TOC_MAX_GAP = 2;

export function stripTableOfContents(lines: string[]): string[] {
  const limit = Math.min(lines.length, TOC_SCAN_LINES);
  const cluster: number[] = [];
  for (let i = 0; i < limit; i++) {
    if (!TOC_LINE.test(lines[i].trim())) continue;
    if (cluster.length > 0 && i - cluster[cluster.length - 1] > TOC_MAX_GAP) break;
    cluster.push(i);
  }
  if (cluster.length < TOC_MIN_RUN) return lines;
  const remove = new Set(cluster);
  return lines.filter((_, i) => !remove.has(i));
}

export function splitIntoSections(text: string): SectionBlock[] {
  const lines = stripTableOfContents(text.split(/\r?\n/));
  const blocks: SectionBlock[] = [];
  let currentSection: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) blocks.push({ section: currentSection ?? "Introduction", content });
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (isHeadingLine(trimmed)) {
      flush();
      currentSection = trimmed;
    } else {
      buffer.push(line);
    }
  }
  flush();

  // No headings detected anywhere: label the whole text as one document block.
  if (text.trim() && blocks.length === 1 && currentSection === null) {
    return [{ section: "Document", content: blocks[0].content }];
  }
  if (blocks.length === 0 && text.trim()) {
    return [{ section: "Document", content: text.trim() }];
  }
  return blocks;
}

export function chunkText(
  text: string,
  maxTokens = 500,
  overlapTokens = 50,
): string[] {
  const tokens = encode(text);
  if (tokens.length <= maxTokens) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < tokens.length) {
    const end = Math.min(start + maxTokens, tokens.length);
    chunks.push(decode(tokens.slice(start, end)));
    if (end === tokens.length) break;
    start = Math.max(0, end - overlapTokens);
  }
  return chunks;
}

export function buildChunksFromDocument(text: string) {
  const sections = splitIntoSections(text);
  const output: { section: string; content: string; chunkIndex: number }[] = [];
  let index = 0;
  for (const block of sections) {
    const parts = chunkText(block.content);
    for (const part of parts) {
      output.push({ section: block.section, content: part, chunkIndex: index++ });
    }
  }
  return output;
}
