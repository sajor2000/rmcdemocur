import { describe, expect, it } from "vitest";
import {
  OBJECTIVES_METHOD_NOTE,
  objectivesRowsToCsv,
  objectivesRowsToJson,
  summarizeObjectivesExportRows,
  type ObjectivesExportRow,
} from "@/lib/objectives-export";

const sampleRow = (overrides: Partial<ObjectivesExportRow> = {}): ObjectivesExportRow => ({
  module: "M1",
  courseCode: "RMD 563",
  courseTitle: "Food to Fuel",
  caseNumber: 1,
  caseTitle: "Case 1",
  ordinal: 1,
  objectiveCode: "EO-0001",
  objective: "Describe glucose metabolism",
  section: "Learning Objectives",
  extractionMethod: "regex",
  confidence: "high",
  sourceFilename: "case1-self-study.pdf",
  sourcePage: null,
  sourceExcerpt: "EO-0001 Describe glucose metabolism",
  objectiveId: 1,
  documentId: 10,
  ...overrides,
});

describe("objectives export", () => {
  it("CSV leads with the method note, then header, then data rows", () => {
    const lines = objectivesRowsToCsv([sampleRow()]).split("\n");
    expect(lines[0]).toMatch(/^"# .*regex-first/i);
    expect(lines[1]).toContain("module,course_code,course_title");
    expect(lines[1]).toContain("objective,section,extraction_method");
    expect(lines[2]).toContain("EO-0001");
    expect(lines[2]).toContain("Describe glucose metabolism");
  });

  it("escapes quotes and commas in objective and source_excerpt cells", () => {
    const csv = objectivesRowsToCsv([
      sampleRow({
        objective: 'a, "b"',
        sourceExcerpt: 'excerpt, "quoted"',
      }),
    ]);
    expect(csv).toContain('"a, ""b"""');
    expect(csv).toContain('"excerpt, ""quoted"""');
  });

  it("prefixes formula-like objective text to block spreadsheet injection", () => {
    const csv = objectivesRowsToCsv([sampleRow({ objective: "=1+1" })]);
    expect(csv).toContain(`"'=1+1"`);
  });

  it("JSON summary counts only explicit regex and llm_cleanup rows", () => {
    const rows = [
      sampleRow(),
      sampleRow({ objectiveId: 2, extractionMethod: "llm_cleanup" }),
      sampleRow({ objectiveId: 3, extractionMethod: null }),
    ];
    const summary = summarizeObjectivesExportRows(rows);
    expect(summary.total).toBe(3);
    expect(summary.regexCount).toBe(1);
    expect(summary.llmCount).toBe(1);
  });

  it("JSON carries method, scope, summary, and objectives", () => {
    const rows = [sampleRow(), sampleRow({ objectiveId: 2, extractionMethod: "llm_cleanup" })];
    const summary = summarizeObjectivesExportRows(rows);
    const j = objectivesRowsToJson(rows, "Course RMD 563", summary);
    expect(j.method).toBe(OBJECTIVES_METHOD_NOTE);
    expect(j.scope).toBe("Course RMD 563");
    expect(j.summary.total).toBe(2);
    expect(j.summary.regexCount).toBe(1);
    expect(j.summary.llmCount).toBe(1);
    expect(j.objectives).toHaveLength(2);
  });

  it("empty rows produce method note and header only", () => {
    const lines = objectivesRowsToCsv([]).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^"# /);
    expect(lines[1]).toContain("objective_id,document_id");
  });
});
