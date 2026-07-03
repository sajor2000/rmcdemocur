import { describe, expect, it } from "vitest";
import { splitIntoSections, buildChunksFromDocument } from "@/lib/chunker";
import { deriveCoverageStatus } from "@/lib/gap-analyzer";

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

  it("returns Document fallback for short unstructured text", () => {
    const sections = splitIntoSections("just a short note");
    expect(sections).toEqual([{ section: "Document", content: "just a short note" }]);
  });
});

describe("gap-analyzer", () => {
  it("marks zero chunks as gap", () => {
    expect(deriveCoverageStatus(0, 0)).toBe("gap");
  });

  it("marks high confidence as covered", () => {
    expect(deriveCoverageStatus(3, 0.85)).toBe("covered");
  });

  it("marks partial for low confidence with chunks", () => {
    expect(deriveCoverageStatus(1, 0.3)).toBe("partial");
    expect(deriveCoverageStatus(2, 0.6)).toBe("partial");
  });

  it("marks covered at confidence threshold boundary", () => {
    expect(deriveCoverageStatus(1, 0.8)).toBe("covered");
  });
});
