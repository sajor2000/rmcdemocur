import { describe, expect, it } from "vitest";
import {
  sortObjectivesExportRows,
  type ObjectivesExportRow,
} from "@/lib/objectives-export";

const row = (overrides: Partial<ObjectivesExportRow>): ObjectivesExportRow => ({
  module: "M1",
  courseCode: "RMD 563",
  courseTitle: "Food to Fuel",
  caseNumber: 1,
  caseTitle: "Case 1",
  ordinal: 1,
  objectiveCode: null,
  objective: "test",
  section: null,
  extractionMethod: "regex",
  confidence: "high",
  sourceFilename: "a.pdf",
  sourcePage: null,
  sourceExcerpt: null,
  objectiveId: 1,
  documentId: 1,
  ...overrides,
});

describe("objectives export query helpers", () => {
  it("sorts by course code, case number, then ordinal", () => {
    const sorted = sortObjectivesExportRows([
      row({ courseCode: "ZZZ 999", caseNumber: 1, ordinal: 1, objectiveId: 3 }),
      row({ courseCode: "RMD 563", caseNumber: 2, ordinal: 1, objectiveId: 2 }),
      row({ courseCode: "RMD 563", caseNumber: 1, ordinal: 2, objectiveId: 1 }),
    ]);
    expect(sorted.map((r) => r.objectiveId)).toEqual([1, 2, 3]);
  });
});
