import { describe, expect, it } from "vitest";
import { coveredElsewhere } from "@/lib/course-scope";

describe("coveredElsewhere (U4)", () => {
  it("returns the unverified cross-course note for a curated topic (MEN → M2 Heme/Onc)", () => {
    const note = coveredElsewhere("usmle:endocrine-system:multiple-endocrine-neoplasia-men1-men2");
    expect(note).toBeDefined();
    expect(note?.course).toBe("M2 Heme/Onc");
    expect(note?.assertedBy).toBeTruthy();
    expect(note?.assertedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns undefined for an unmapped topic and for null/undefined", () => {
    expect(coveredElsewhere("usmle:gastrointestinal-system:disorders-of-the-pancreas")).toBeUndefined();
    expect(coveredElsewhere(null)).toBeUndefined();
    expect(coveredElsewhere(undefined)).toBeUndefined();
  });
});
