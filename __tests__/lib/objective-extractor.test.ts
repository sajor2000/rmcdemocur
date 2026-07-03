import { describe, expect, it } from "vitest";
import {
  dedupeObjectives,
  extractObjectivesFromText,
  findObjectiveSections,
  needsLlmCleanup,
} from "@/lib/objective-extractor";
import { validateCleanedObjectives } from "@/lib/objective-cleanup";
import fs from "fs";
import path from "path";

const fixture = fs.readFileSync(
  path.join(__dirname, "../fixtures/objectives/self-study-snippet.txt"),
  "utf-8",
);

describe("objective-extractor", () => {
  it("finds objective sections in curriculum text", () => {
    const sections = findObjectiveSections(fixture);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections.some((s) => /Case Specific/i.test(s.heading))).toBe(true);
    expect(sections.some((s) => /Learning Objectives/i.test(s.heading))).toBe(true);
  });

  it("extracts case-specific objectives with EO codes via regex", () => {
    const objectives = extractObjectivesFromText(fixture);
    const eoObjectives = objectives.filter((o) => o.eoCode?.startsWith("EO-"));
    expect(eoObjectives.length).toBe(2);
    expect(eoObjectives[0].text).toContain("foregut");
    expect(eoObjectives[0].extractionMethod).toBe("regex");
    expect(eoObjectives[0].confidence).toBe("high");
  });

  it("extracts learning objectives and filters noise lines", () => {
    const objectives = extractObjectivesFromText(fixture);
    const learning = objectives.filter((o) =>
      o.sectionHeading.includes("Learning Objectives"),
    );
    expect(learning.length).toBe(4);
    expect(learning.every((o) => !/Answer self-study/i.test(o.text))).toBe(true);
    expect(learning.every((o) => !/At the end of this section/i.test(o.text))).toBe(true);
  });

  it("deduplicates identical objectives", () => {
    const duped = [
      {
        text: "Describe the liver.",
        ordinal: 1,
        sectionHeading: "Learning Objectives",
        sourceLineStart: 0,
        extractionMethod: "regex" as const,
        confidence: "high" as const,
      },
      {
        text: "Describe the liver.",
        ordinal: 2,
        sectionHeading: "Learning Objectives",
        sourceLineStart: 1,
        extractionMethod: "regex" as const,
        confidence: "high" as const,
      },
    ];
    expect(dedupeObjectives(duped)).toHaveLength(1);
  });

  it("flags LLM cleanup when section found but no objectives", () => {
    const text =
      "Learning Objectives:\n\nAt the end of this section, you should be able to:\n\nOverview\n\nActivity 1: Test";
    const sections = findObjectiveSections(text);
    const objectives = extractObjectivesFromText(text);
    expect(sections.length).toBeGreaterThan(0);
    expect(objectives.length).toBe(0);
    expect(needsLlmCleanup(objectives, sections)).toBe(true);
  });
});

describe("objective-cleanup validation", () => {
  it("accepts objectives that appear verbatim in source", () => {
    const source = fixture;
    const valid = validateCleanedObjectives(
      ["Describe the various components of the mucosal immune system."],
      source,
    );
    expect(valid).toHaveLength(1);
  });

  it("rejects fabricated objectives not in source", () => {
    const valid = validateCleanedObjectives(
      ["Perform open-heart surgery without supervision."],
      fixture,
    );
    expect(valid).toHaveLength(0);
  });
});
