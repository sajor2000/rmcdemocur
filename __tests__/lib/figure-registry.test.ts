import fs from "fs/promises";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildDocumentFigureMeta, buildFigureRegistry } from "@/lib/figure-registry";

const FIXTURE_DIR = path.join(__dirname, "../fixtures/figure-registry");

describe("figure-registry", () => {
  it("detects Case 4 answer images with inline captions", async () => {
    const text = await fs.readFile(
      path.join(FIXTURE_DIR, "case4-john-jackson-answer-image.txt"),
      "utf8",
    );
    const meta = buildDocumentFigureMeta(
      "RMD563_FacultyGuide_Case4_JohnJackson.docx",
      "docx",
      4,
    );
    const registry = buildFigureRegistry(text, meta);
    const answerRows = registry.filter((row) => row.referenceKind === "answer_image");
    expect(answerRows.length).toBeGreaterThanOrEqual(2);
    expect(answerRows.some((row) => row.label.includes("1A"))).toBe(true);
    expect(answerRows.every((row) => row.hasCaptionInText)).toBe(true);
  });

  it("captures Case 3 table context after bare Answer image label", async () => {
    const text = await fs.readFile(
      path.join(FIXTURE_DIR, "case3-marie-herandez-table-snippet.txt"),
      "utf8",
    );
    const meta = buildDocumentFigureMeta(
      "RMD563_FacultyGuide_Case3_MarieHernandez.docx",
      "docx",
      3,
    );
    const registry = buildFigureRegistry(text, meta);
    const answer = registry.find((row) => row.referenceKind === "answer_image");
    expect(answer?.textForEmbed).toMatch(/SERUM AMINO ACIDS/i);
  });

  it("returns empty registry for empty text", () => {
    const meta = buildDocumentFigureMeta("x.docx", "docx", 1);
    expect(buildFigureRegistry("", meta)).toEqual([]);
  });

  it("captures decimal figure numbers instead of truncating them", () => {
    const meta = buildDocumentFigureMeta("x.docx", "docx", 1);
    const registry = buildFigureRegistry("Figure 8.2: Reactions of intermediary metabolism", meta);
    expect(registry[0].label).toBe("Figure 8.2");
  });

  it("does not collide two distinct decimal-numbered figures under one label", () => {
    const meta = buildDocumentFigureMeta("x.docx", "docx", 1);
    const registry = buildFigureRegistry(
      "Figure 8.2: First figure\nFigure 8.3: Second figure",
      meta,
    );
    const labels = registry.filter((r) => r.referenceKind === "figure").map((r) => r.label);
    expect(labels).toEqual(["Figure 8.2", "Figure 8.3"]);
  });

  it("assigns the same sourceIndex to every repeated mention of the same figure label", () => {
    const meta = buildDocumentFigureMeta("x.docx", "docx", 1);
    const registry = buildFigureRegistry(
      "Figure 8.2: The actual caption\nFigure 8.2 is referenced again on a later slide.",
      meta,
    );
    const sourceIndexes = registry.map((r) => r.sourceIndex);
    expect(registry).toHaveLength(2);
    expect(new Set(sourceIndexes)).toEqual(new Set([1]));
  });

  it("assigns distinct, increasing sourceIndex values to distinct figure labels in document order", () => {
    const meta = buildDocumentFigureMeta("x.docx", "docx", 1);
    const registry = buildFigureRegistry("Figure 1: First\nFigure 2: Second", meta);
    const figures = registry.filter((r) => r.referenceKind === "figure");
    expect(figures.map((f) => f.sourceIndex)).toEqual([1, 2]);
  });
});
