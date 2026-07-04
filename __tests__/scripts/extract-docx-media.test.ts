import { describe, expect, it } from "vitest";
import { resolveExtractTargets } from "@/scripts/extract-docx-media";

describe("extract-docx-media targets", () => {
  it("defaults to faculty DOCX files only", () => {
    const targets = resolveExtractTargets("faculty");
    expect(targets.every((name) => name.includes("FacultyGuide"))).toBe(true);
    expect(targets.every((name) => name.endsWith(".docx"))).toBe(true);
    expect(targets).not.toContain("RMD563_SelfStudyGuide_Case4_JohnJackson.docx");
  });

  it("includes self-study when scope is self_study", () => {
    const targets = resolveExtractTargets("self_study");
    expect(targets.every((name) => name.includes("SelfStudyGuide"))).toBe(true);
  });
});
