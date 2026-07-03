import { encode, decode } from "gpt-tokenizer";

export type SectionBlock = {
  section: string;
  content: string;
};

const SECTION_PATTERNS = [
  /^Activity\s+\d+[A-Z]?:.*$/im,
  /^Take-Home Points.*$/im,
  /^Case\s+\d+.*$/im,
  /^Learning Objectives.*$/im,
  /^Objectives.*$/im,
];

export function splitIntoSections(text: string): SectionBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: SectionBlock[] = [];
  let currentSection = "Introduction";
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) blocks.push({ section: currentSection, content });
    buffer = [];
  };

  for (const line of lines) {
    const isHeading = SECTION_PATTERNS.some((p) => p.test(line.trim()));
    if (isHeading && buffer.length > 0) {
      flush();
      currentSection = line.trim();
    } else if (isHeading) {
      currentSection = line.trim();
    } else {
      buffer.push(line);
    }
  }
  flush();

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
