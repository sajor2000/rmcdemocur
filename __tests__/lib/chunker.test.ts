import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { encode } from "gpt-tokenizer";
import { splitIntoSections, buildChunksFromDocument, chunkText } from "@/lib/chunker";

const selfStudyFixture = fs.readFileSync(
  path.join(__dirname, "../fixtures/chunker/self-study-headings-snippet.txt"),
  "utf8",
);

describe("chunker", () => {
  it("splits on Activity headings", () => {
    const text = `Introduction line\nActivity 1: Clinical Reasoning\nBody one\nTake-Home Points\nSummary text`;
    const sections = splitIntoSections(text);
    expect(sections.some((s) => s.section.includes("Activity 1"))).toBe(true);
    expect(sections.some((s) => s.section.includes("Take-Home"))).toBe(true);
  });

  it("builds chunks with indices", () => {
    const chunks = buildChunksFromDocument("Activity 1: Test\n" + "word ".repeat(600));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].chunkIndex).toBe(0);
  });

  // U1: self-study heading vocabulary
  it("splits on self-study headings", () => {
    const text = [
      "Intro line",
      "Self-Study Topics:",
      "Topic body ".repeat(30),
      "Discipline Director Notes:",
      "Notes body ".repeat(30),
      "Rationale:",
      "Because of X. ".repeat(20),
      "Question 3",
      "A 24-month-old presents with... ".repeat(10),
    ].join("\n");
    const sections = splitIntoSections(text);
    const names = sections.map((s) => s.section);
    expect(names.some((n) => n.startsWith("Self-Study Topics"))).toBe(true);
    expect(names.some((n) => n.startsWith("Discipline Director Notes"))).toBe(true);
    expect(names.some((n) => n.startsWith("Rationale"))).toBe(true);
    expect(names.some((n) => n.startsWith("Question 3"))).toBe(true);
  });

  it("matches named vocab with inline content and generic trailing colon", () => {
    const text = [
      "Intro",
      "Key Words: insulin, glucagon",
      "body ".repeat(30),
      "HORMONE:",
      "Secretin discussion. ".repeat(20),
      "This sentence mentions a ratio: 3 to 1 and continues prose for a while longer here.",
      "more prose ".repeat(20),
    ].join("\n");
    const sections = splitIntoSections(text);
    const names = sections.map((s) => s.section);
    expect(names.some((n) => n.startsWith("Key Words"))).toBe(true);
    expect(names.some((n) => n === "HORMONE:")).toBe(true);
    expect(names.some((n) => n.startsWith("This sentence mentions"))).toBe(false);
  });

  it("stoplists interstitial labels so they stay inside their section", () => {
    const text = [
      "Activity 1: Clinical Reasoning",
      "Question stem here. ".repeat(10),
      "Answer:",
      "The answer is B. ".repeat(10),
      "Answer Image:",
      "described image content ".repeat(10),
    ].join("\n");
    const sections = splitIntoSections(text);
    const names = sections.map((s) => s.section);
    expect(names.some((n) => n.startsWith("Answer"))).toBe(false);
    const activity = sections.find((s) => s.section.startsWith("Activity 1"));
    expect(activity?.content).toContain("The answer is B.");
  });

  it("strips a table-of-contents region near the document head", () => {
    const toc = [
      "TABLE OF CONTENTS",
      "Case 2\t14",
      "Activity 1B: Questions for Marie Hernandez\t13",
      "Take-Home Points\t32",
      "Session Assessment/Secure Review\t33",
    ].join("\n");
    const body = [
      "Case 3: Marie Hernandez",
      "Real case content here. ".repeat(30),
      "Sodium\t140", // table-like line deep in body must survive
      "more content ".repeat(30),
    ].join("\n");
    const sections = splitIntoSections(`${toc}\n${body}`);
    const all = sections.map((s) => `${s.section}\n${s.content}`).join("\n");
    expect(all).not.toContain("Take-Home Points\t32");
    expect(all).not.toContain("Case 2\t14");
    expect(all).toContain("Sodium\t140");
    expect(sections.some((s) => s.section.startsWith("Case 3"))).toBe(true);
  });

  it("splits self-study fixture on real heading vocabulary", () => {
    const sections = splitIntoSections(selfStudyFixture);
    const names = sections.map((s) => s.section);
    expect(names.some((n) => n.startsWith("Self-Study Topics"))).toBe(true);
    expect(names.some((n) => n.startsWith("Discipline Director Notes"))).toBe(true);
    expect(names.some((n) => n.startsWith("Rationale"))).toBe(true);
    expect(names.some((n) => n.startsWith("Question 3"))).toBe(true);
  });

  it("returns Document fallback for short unstructured text", () => {
    const sections = splitIntoSections("just a short note");
    expect(sections).toEqual([{ section: "Document", content: "just a short note" }]);
  });
});

describe("chunkText (U2 recursive splitter)", () => {
  const sentence = (n: number) =>
    `This is sentence number ${n} and it contains enough words to matter here.`;

  it("returns a single chunk when under the token budget", () => {
    const text = [sentence(1), sentence(2)].join(" ");
    expect(chunkText(text)).toEqual([text]);
  });

  it("splits long content on sentence boundaries, not mid-word", () => {
    const text = Array.from({ length: 120 }, (_, i) => sentence(i)).join(" ");
    const chunks = chunkText(text, 200, 20);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      // no chunk ends mid-word: last char is sentence-terminal
      expect(/[.!?]$/.test(c.trim())).toBe(true);
    }
  });

  it("keeps each chunk within the token budget (allowing overlap)", () => {
    const text = Array.from({ length: 200 }, (_, i) => sentence(i)).join(" ");
    const max = 200;
    const chunks = chunkText(text, max, 20);
    for (const c of chunks) {
      expect(encode(c).length).toBeLessThanOrEqual(max + 40);
    }
  });

  it("hard-splits a single sentence longer than the budget without throwing", () => {
    const giant = "word ".repeat(800).trim(); // one 'sentence', no terminal punctuation
    const chunks = chunkText(giant, 200, 20);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toContain("word");
  });

  it("overlaps trailing sentences into the next chunk", () => {
    const sentences = Array.from({ length: 60 }, (_, i) => sentence(i));
    const chunks = chunkText(sentences.join(" "), 150, 30);
    expect(chunks.length).toBeGreaterThan(1);
    // some sentence text from the end of chunk[0] reappears at the start of chunk[1]
    const tail = chunks[0].trim().split(/(?<=[.!?])\s+/).slice(-1)[0];
    expect(chunks[1]).toContain(tail);
  });

  it("packs paragraph-separated content without mixing paragraphs when overlap is disabled", () => {
    const para1 = Array.from({ length: 50 }, (_, i) => `Alpha sentence ${i} with enough words here.`).join(" ");
    const para2 = Array.from({ length: 50 }, (_, i) => `Beta sentence ${i} with enough words here.`).join(" ");
    const chunks = chunkText(`${para1}\n\n${para2}`, 180, 0);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const hasAlpha = chunk.includes("Alpha sentence");
      const hasBeta = chunk.includes("Beta sentence");
      expect(hasAlpha && hasBeta).toBe(false);
    }
  });
});

describe("buildChunksFromDocument (U2 junk filter + U3 embedText)", () => {
  it("prefixes embedText with case title breadcrumb while keeping raw content", () => {
    const chunks = buildChunksFromDocument(
      "Rationale:\nShort rationale content here for testing.",
      "Marie Hernandez",
    );
    expect(chunks[0].embedText.startsWith("Marie Hernandez › Rationale:")).toBe(true);
    expect(chunks[0].embedText).toContain(chunks[0].content);
    expect(chunks[0].content).not.toContain("Marie Hernandez");
  });

  it("drops a tiny table-of-contents fragment section instead of embedding it", () => {
    const text = [
      "Self-Study Topics:",
      "Real topic content that is long enough to be a legitimate chunk. ".repeat(20),
      "Overview:",
      "x\t3", // tiny junk fragment as the whole section body
    ].join("\n");
    const chunks = buildChunksFromDocument(text);
    expect(chunks.every((c) => encode(c.content).length >= 40 || c.section === "Overview:")).toBe(true);
    // the tiny "x\t3" fragment must not survive as its own chunk
    expect(chunks.some((c) => c.content.trim() === "x\t3")).toBe(false);
  });

  it("preserves a short sole-chunk section (does not silently lose content)", () => {
    const text = [
      "Rationale:",
      "Short but real rationale sentence.",
    ].join("\n");
    const chunks = buildChunksFromDocument(text);
    expect(chunks.some((c) => c.content.includes("Short but real rationale"))).toBe(true);
  });

  it("merges consecutive sub-floor fragments into the next kept chunk", () => {
    const text = [
      "Self-Study Topics:",
      "Real topic content that is long enough to be a legitimate chunk. ".repeat(20),
      "Overview:",
      "tiny lead-in.",
      "Also tiny.",
    ].join("\n");
    const chunks = buildChunksFromDocument(text);
    expect(chunks.some((c) => c.content.includes("tiny lead-in"))).toBe(true);
    expect(chunks.every((c) => encode(c.content).length >= 40 || c.section === "Overview:")).toBe(true);
  });
});
