import { describe, expect, it } from "vitest";
import { distribution } from "@/lib/coverage";
import {
  buildCourseHeatmap,
  dedupeCaseList,
  filterHeatmapForCase,
} from "@/lib/queries";

describe("filterHeatmapForCase", () => {
  it("returns only rows for the requested case", () => {
    const heatmap = buildCourseHeatmap(
      [
        { case_number: 1, system: "Gastrointestinal System", domains_touched: 4 },
        { case_number: 2, system: "Gastrointestinal System", domains_touched: 2 },
      ],
      new Map([["Gastrointestinal System", 6]]),
    );
    expect(filterHeatmapForCase(heatmap, 2)).toEqual([
      { system: "Gastrointestinal System", status: "partial" },
    ]);
  });

  it("returns empty when case has no heatmap rows", () => {
    expect(filterHeatmapForCase([], 3)).toEqual([]);
  });
});

describe("dedupeCaseList", () => {
  it("keeps one row per case_number preferring faculty guide title", () => {
    const docs = [
      {
        id: 1,
        caseNumber: 1,
        caseTitle: "David Tilo (Self-Study)",
        filename: "Case1_SelfStudy.docx",
      },
      {
        id: 2,
        caseNumber: 1,
        caseTitle: "David Tilo",
        filename: "Case1_FacultyGuide.pdf",
      },
      {
        id: 3,
        caseNumber: 2,
        caseTitle: "Jessica Donner",
        filename: "Case2_FacultyGuide.pdf",
      },
    ];
    const result = dedupeCaseList(docs);
    expect(result).toHaveLength(2);
    expect(result[0].caseTitle).toBe("David Tilo");
    expect(result[1].caseNumber).toBe(2);
  });
});

describe("case scope distribution shape", () => {
  it("produces mostly introduced/reinforced for thin doc counts", () => {
    const dist = distribution([1, 2, 0, 1], 10);
    expect(dist.introduced).toBe(2);
    expect(dist.reinforced).toBe(1);
    expect(dist.gap).toBe(7);
  });
});
