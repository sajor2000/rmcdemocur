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
});
