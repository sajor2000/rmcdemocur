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

export const MIN_CHUNK_TOKENS = 40;

/** Split a line into sentence units. */
function splitLineIntoSentences(line: string): string[] {
  return line
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Split content into paragraphs, each a list of sentence-ish units. Preferring
 * paragraph then line then sentence boundaries means a chunk never severs a
 * sentence unless the sentence alone exceeds the token budget, and packing never
 * fuses two paragraphs into one chunk. */
function splitIntoParagraphs(text: string): string[][] {
  const paragraphs: string[][] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const units: string[] = [];
    // Line breaks are unit boundaries too: list items, table rows, and lab values
    // are their own units, so a chunk never cuts through the middle of a line.
    for (const line of paragraph.split(/\r?\n/)) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      units.push(...splitLineIntoSentences(trimmedLine));
    }
    if (units.length) paragraphs.push(units);
  }
  return paragraphs.length ? paragraphs : [[text.trim()]].filter((p) => p[0]);
}

/** Hard-split a single over-budget unit on token boundaries (last resort). */
function hardSplit(unit: string, maxTokens: number, overlapTokens: number): string[] {
  const tokens = encode(unit);
  if (tokens.length <= maxTokens) return [unit];
  const out: string[] = [];
  let start = 0;
  while (start < tokens.length) {
    const end = Math.min(start + maxTokens, tokens.length);
    out.push(decode(tokens.slice(start, end)).trim());
    if (end === tokens.length) break;
    start = Math.max(0, end - overlapTokens);
  }
  return out;
}

/** Recursive sentence/paragraph-aware splitter. Packs sentence units up to the
 * token budget, carries `overlapTokens` of trailing sentences into the next
 * chunk, and only hard-splits a lone sentence that exceeds the budget. */
export function chunkText(
  text: string,
  maxTokens = 500,
  overlapTokens = 50,
): string[] {
  if (encode(text).length <= maxTokens) return [text];

  const paragraphs = splitIntoParagraphs(text);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length) {
      chunks.push(current.join(" ").trim());
      current = [];
      currentTokens = 0;
    }
  };

  const seedOverlap = () => {
    // Overlap: seed the next chunk with trailing sentences of the previous one.
    if (overlapTokens <= 0 || !chunks.length) return;
    const prevUnits = chunks[chunks.length - 1].split(/(?<=[.!?])\s+/);
    const carry: string[] = [];
    let carryTokens = 0;
    for (let i = prevUnits.length - 1; i >= 0; i--) {
      const t = encode(prevUnits[i]).length;
      if (carryTokens + t > overlapTokens) break;
      carry.unshift(prevUnits[i]);
      carryTokens += t;
    }
    current = carry;
    currentTokens = carryTokens;
  };

  for (const units of paragraphs) {
    // Paragraph boundary: never fuse two paragraphs into one chunk.
    flush();
    for (const unit of units) {
      const unitTokens = encode(unit).length;

      if (unitTokens > maxTokens) {
        // A single sentence larger than the budget: flush, then hard-split it.
        flush();
        for (const piece of hardSplit(unit, maxTokens, overlapTokens)) chunks.push(piece);
        continue;
      }

      if (currentTokens + unitTokens > maxTokens && current.length) {
        flush();
        seedOverlap();
      }

      current.push(unit);
      currentTokens += unitTokens;
    }
    flush();
  }

  return chunks.filter(Boolean);
}

/** Merge sub-floor fragments into neighbors without mutating the input array. */
function mergeSubFloorParts(parts: string[]): string[] {
  if (parts.length <= 1) return parts;

  const merged: string[] = [];
  let pending: string | null = null;

  for (const part of parts) {
    const tokens = encode(part).length;
    if (tokens >= MIN_CHUNK_TOKENS) {
      if (pending) {
        merged.push(`${pending} ${part}`.trim());
        pending = null;
      } else {
        merged.push(part);
      }
      continue;
    }

    if (merged.length) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${part}`.trim();
    } else {
      pending = pending ? `${pending} ${part}`.trim() : part;
    }
  }

  if (pending) {
    if (merged.length) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${pending}`.trim();
    } else {
      merged.push(pending);
    }
  }

  return merged.length ? merged : [parts[0]];
}

export function buildChunksFromDocument(text: string, caseTitle?: string) {
  const sections = splitIntoSections(text);
  const output: {
    section: string;
    content: string;
    embedText: string;
    chunkIndex: number;
    blockIndex: number;
  }[] = [];
  let index = 0;
  let blockIndex = 0;

  for (const block of sections) {
    const parts = chunkText(block.content);

    // Junk filter: drop page-number/ToC fragments outright (no retrievable
    // meaning), then merge any remaining sub-floor fragment into an adjacent
    // kept chunk so no tiny chunk is embedded on its own. A section's sole real
    // chunk is always preserved.
    const nonJunk = parts.filter(
      (p) => !(encode(p).length < MIN_CHUNK_TOKENS && TOC_LINE.test(p.trim())),
    );
    const finalParts = mergeSubFloorParts(nonJunk);

    for (const part of finalParts) {
      const breadcrumb = caseTitle
        ? `${caseTitle} › ${block.section}`
        : block.section;
      output.push({
        section: block.section,
        content: part,
        embedText: `${breadcrumb}\n${part}`,
        chunkIndex: index++,
        blockIndex,
      });
    }
    blockIndex++;
  }
  return output;
}
