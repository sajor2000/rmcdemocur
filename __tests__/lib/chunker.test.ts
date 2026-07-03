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
