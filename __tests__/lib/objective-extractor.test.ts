import { describe, expect, it } from "vitest";
import {
  dedupeObjectives,
  extractObjectivesFromText,
  findObjectiveSections,
  mergeCleanedWithRegex,
  needsLlmCleanup,
} from "@/lib/objective-extractor";
import { validateCleanedObjectives } from "@/lib/objective-cleanup";
import { PAGE_BREAK_MARKER } from "@/lib/document-parser";
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
        sourceExcerpt: "Learning Objectives",
        extractionMethod: "regex" as const,
        confidence: "high" as const,
      },
      {
        text: "Describe the liver.",
        ordinal: 2,
        sectionHeading: "Learning Objectives",
        sourceLineStart: 1,
        sourceExcerpt: "Learning Objectives",
        extractionMethod: "regex" as const,
        confidence: "high" as const,
      },
    ];
    expect(dedupeObjectives(duped)).toHaveLength(1);
  });

  it("does not flag LLM cleanup for long high-confidence EO objectives", () => {
    const longEo: Parameters<typeof needsLlmCleanup>[0] = [
      {
        text: "Identify the abdominal viscera of the foregut (i.e., stomach, duodenum, liver, pancreas, gallbladder, and spleen), describe their internal and external features, describe their relationships to adjacent structures, explain their major functional roles, and name their arterial supply and venous drainage. (EO-0052)",
        ordinal: 1,
        sectionHeading: "Case Specific Objectives",
        sourceLineStart: 0,
        sourceExcerpt: "Case Specific Objectives",
        extractionMethod: "regex",
        confidence: "high",
        eoCode: "EO-0052",
      },
    ];
    const sections = findObjectiveSections(fixture);
    expect(needsLlmCleanup(longEo, sections, fixture)).toBe(false);
  });

  it("flags LLM cleanup when section found but no objectives", () => {
    const text =
      "Learning Objectives:\n\nAt the end of this section, you should be able to:\n\nOverview\n\nActivity 1: Test";
    const sections = findObjectiveSections(text);
    const objectives = extractObjectivesFromText(text);
    expect(sections.length).toBeGreaterThan(0);
    expect(objectives.length).toBe(0);
    expect(needsLlmCleanup(objectives, sections, text)).toBe(true);
  });

  it("does not flag LLM cleanup when section is topics-only (no verb objectives)", () => {
    const text = [
      "Case Specific Objectives:",
      "",
      "Self-Study Topics:",
      "",
      "Posterior Abdominal Wall Contents (TO-0010)",
    ].join("\n");
    const sections = findObjectiveSections(text);
    const objectives = extractObjectivesFromText(text);
    expect(sections.length).toBeGreaterThan(0);
    expect(objectives).toHaveLength(0);
    expect(needsLlmCleanup(objectives, sections, text)).toBe(false);
  });

  it("assigns sourcePage from page markers in document text", () => {
    const text = [
      "Learning Objectives:",
      "",
      "Describe the foregut. (EO-0001)",
      "",
      PAGE_BREAK_MARKER,
      "",
      "Identify the midgut. (EO-0002)",
    ].join("\n");
    const objectives = extractObjectivesFromText(text);
    expect(objectives).toHaveLength(2);
    expect(objectives[0].sourcePage).toBe(1);
    expect(objectives[1].sourcePage).toBe(2);
    expect(objectives.every((o) => !o.text.includes(PAGE_BREAK_MARKER))).toBe(true);
  });

  it("filters bibliography noise from objectives", () => {
    const text = `Learning Objectives:

Describe the role of nutrition in health.

ISBN: 9780323680424
Authors: Frank H. Netter
Publisher: Elsevier

Explain how macronutrients are metabolized.`;

    const objectives = extractObjectivesFromText(text);
    expect(objectives).toHaveLength(2);
    expect(objectives.every((o) => !/ISBN|Authors|Publisher/i.test(o.text))).toBe(true);
  });
});

describe("objective-extractor topic lines (TO codes)", () => {
  it("skips Self-Study Topics list items — TO codes are study topics, not objectives", () => {
    const text = [
      "Case Specific Objectives* - Review prior to the case.",
      "",
      "Note: this anatomy is background and is not itself an objective line here.",
      "",
      "Self-Study Topics:",
      "",
      "Posterior Abdominal Wall Contents (TO-0010)",
      "Superior and Inferior Mesenteric Vessels (TO-0011)",
    ].join("\n");
    const objectives = extractObjectivesFromText(text);
    expect(objectives.filter((o) => o.eoCode?.startsWith("TO-"))).toHaveLength(0);
    expect(objectives).toHaveLength(0);
  });

  it("drops media-pointer topic rows", () => {
    const text = [
      "Case Specific Objectives:",
      "",
      "Self-Study Topics:",
      "",
      "Posterior Abdominal Wall Contents (TO-0010)",
      "Abdominal Cavity: Posterior Abdominal Wall (TO-0010) (30:37)",
      "SLIDES: Posterior Abdominal Wall Contents (TO-0010)",
    ].join("\n");
    const objectives = extractObjectivesFromText(text);
    expect(objectives).toHaveLength(0);
  });

  it("captures EO objectives but not adjacent topic titles", () => {
    const text = [
      "Case Specific Objectives:",
      "",
      "Identify the abdominal viscera of the foregut. (EO-0052)",
      "",
      "Self-Study Topics:",
      "",
      "Posterior Abdominal Wall Contents (TO-0010)",
    ].join("\n");
    const objectives = extractObjectivesFromText(text);
    expect(objectives.map((o) => o.eoCode)).toEqual(["EO-0052"]);
  });

  it("regression: a (TO-####) line without a Topics header still ends the section", () => {
    // Guides where a trailing TO line marks the end of objectives must keep
    // their current behavior — the topic reclassification is gated on the header.
    const text = [
      "Learning Objectives:",
      "",
      "Describe the foregut anatomy. (EO-0052)",
      "",
      "Some Topic Without Header (TO-0010)",
      "",
      "Describe the midgut anatomy. (EO-0053)",
    ].join("\n");
    const objectives = extractObjectivesFromText(text);
    expect(objectives.map((o) => o.eoCode)).toEqual(["EO-0052"]);
  });
});

describe("mergeCleanedWithRegex", () => {
  const base = (overrides: Partial<Parameters<typeof mergeCleanedWithRegex>[0][0]>) => ({
    text: "Describe the liver.",
    ordinal: 1,
    sectionHeading: "Learning Objectives",
    sourceLineStart: 0,
    sourceExcerpt: "Learning Objectives",
    extractionMethod: "regex" as const,
    confidence: "medium" as const,
    ...overrides,
  });

  it("keeps regex objectives when LLM adds missing ones", () => {
    const regex = [base({ confidence: "high" })];
    const cleaned = [
      {
        ...base({ text: "Explain pancreatic function." }),
        extractionMethod: "llm_cleanup" as const,
        confidence: "high" as const,
      },
    ];
    const merged = mergeCleanedWithRegex(regex, cleaned, "missing");
    expect(merged).toHaveLength(2);
  });

  it("drops low-confidence regex when LLM cleanup runs for messy output", () => {
    const regex = [
      base({ confidence: "low", text: "Describe the liver and pancreas and spleen and kidneys and gallbladder in one run-on sentence that keeps going." }),
      base({ confidence: "high", text: "Identify foregut structures. (EO-0052)", eoCode: "EO-0052" }),
    ];
    const cleaned = [
      {
        ...base({ text: "Describe the liver." }),
        extractionMethod: "llm_cleanup" as const,
        confidence: "high" as const,
      },
    ];
    const merged = mergeCleanedWithRegex(regex, cleaned, "messy");
    expect(merged.some((o) => o.eoCode === "EO-0052")).toBe(true);
    expect(merged.some((o) => o.confidence === "low")).toBe(false);
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

  it("rejects paraphrased objectives not verbatim in source", () => {
    const valid = validateCleanedObjectives(
      ["Describe mucosal immune components in general terms."],
      fixture,
    );
    expect(valid).toHaveLength(0);
  });
});
