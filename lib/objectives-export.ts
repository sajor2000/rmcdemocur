/**
 * Deterministic serializers for learning-objectives datasets (R11/R12).
 * Pure — no DB, no LLM. Self-describing exports for spreadsheet audit.
 */
export const OBJECTIVES_METHOD_NOTE =
  "Objectives are extracted directly from self-study curriculum documents' own text (EO-#### codes and verb-based learning statements). Self-study topic titles (TO-####) are study topics, not objectives, and are excluded. AI assistance is used only when direct extraction misses or mangles text — it does not fabricate objectives. Faculty guides typically have zero objectives by design. Rows marked llm_cleanup in extraction_method were AI-assisted cleanup only.";

export type ObjectivesExportRow = {
  module: string;
  courseCode: string | null;
  courseTitle: string | null;
  caseNumber: number;
  caseTitle: string | null;
  ordinal: number;
  objectiveCode: string | null;
  objective: string;
  section: string | null;
  extractionMethod: string | null;
  confidence: string | null;
  sourceFilename: string;
  sourcePage: number | null;
  sourceExcerpt: string | null;
  objectiveId: number;
  documentId: number;
};

export type ObjectivesExportSummary = {
  total: number;
  regexCount: number;
  llmCount: number;
  byCase: { caseNumber: number; caseTitle: string | null; count: number }[];
};

const CSV_COLUMNS = [
  "module",
  "course_code",
  "course_title",
  "case_number",
  "case_title",
  "ordinal",
  "objective_code",
  "objective",
  "section",
  "extraction_method",
  "confidence",
  "source_filename",
  "source_page",
  "source_excerpt",
  "objective_id",
  "document_id",
] as const;

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function rowToCsvCells(r: ObjectivesExportRow): string[] {
  return [
    r.module,
    r.courseCode ?? "",
    r.courseTitle ?? "",
    r.caseNumber,
    r.caseTitle ?? "",
    r.ordinal,
    r.objectiveCode ?? "",
    r.objective,
    r.section ?? "",
    r.extractionMethod ?? "",
    r.confidence ?? "",
    r.sourceFilename,
    r.sourcePage ?? "",
    r.sourceExcerpt ?? "",
    r.objectiveId,
    r.documentId,
  ].map(csvCell);
}

/** CSV with a leading method-note row, header row, then flat data rows. */
export function objectivesRowsToCsv(rows: ObjectivesExportRow[]): string {
  const noteRow = `"# ${OBJECTIVES_METHOD_NOTE.replace(/"/g, '""')}"`;
  const dataLines = rows.map((r) => rowToCsvCells(r).join(","));
  return [noteRow, CSV_COLUMNS.join(","), ...dataLines].join("\n");
}

/** JSON dataset with method block, scope label, summary, and objective rows. */
export function objectivesRowsToJson(
  rows: ObjectivesExportRow[],
  scope: string,
  summary: ObjectivesExportSummary,
) {
  return {
    method: OBJECTIVES_METHOD_NOTE,
    scope,
    summary,
    objectives: rows,
  };
}

/** Stable sort: course code → case number → ordinal. */
export function sortObjectivesExportRows(rows: ObjectivesExportRow[]): ObjectivesExportRow[] {
  return [...rows].sort((a, b) => {
    const codeCmp = (a.courseCode ?? "").localeCompare(b.courseCode ?? "");
    if (codeCmp !== 0) return codeCmp;
    if (a.caseNumber !== b.caseNumber) return a.caseNumber - b.caseNumber;
    return a.ordinal - b.ordinal;
  });
}

/** Aggregate regex/llm/byCase counts from export rows (deterministic). */
export function summarizeObjectivesExportRows(
  rows: ObjectivesExportRow[],
): ObjectivesExportSummary {
  const byCase = new Map<
    number,
    { caseNumber: number; caseTitle: string | null; count: number }
  >();
  let regexCount = 0;
  let llmCount = 0;

  for (const row of rows) {
    const existing = byCase.get(row.caseNumber) ?? {
      caseNumber: row.caseNumber,
      caseTitle: row.caseTitle,
      count: 0,
    };
    existing.count++;
    byCase.set(row.caseNumber, existing);
    if (row.extractionMethod === "llm_cleanup") llmCount++;
    else if (row.extractionMethod === "regex") regexCount++;
  }

  return {
    total: rows.length,
    regexCount,
    llmCount,
    byCase: Array.from(byCase.values()).sort((a, b) => a.caseNumber - b.caseNumber),
  };
}
