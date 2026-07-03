import { describe, expect, it } from "vitest";
import {
  ALL_CURRICULUM_FILES,
  FACULTY_GUIDES,
  SELF_STUDY_GUIDES,
} from "../../scripts/curriculum-sources";

describe("curriculum-sources", () => {
  it("lists 7 faculty and 7 self-study guides", () => {
    expect(FACULTY_GUIDES).toHaveLength(7);
    expect(SELF_STUDY_GUIDES).toHaveLength(7);
    expect(ALL_CURRICULUM_FILES).toHaveLength(14);
  });

  it("assigns case numbers 1-7 for each guide type", () => {
    for (const guide of ALL_CURRICULUM_FILES) {
      expect(guide.caseNumber).toBeGreaterThanOrEqual(1);
      expect(guide.caseNumber).toBeLessThanOrEqual(7);
      expect(guide.dest.length).toBeGreaterThan(0);
    }
  });
});
