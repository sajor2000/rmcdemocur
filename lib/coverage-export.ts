import { levelLabel, METHOD_NOTE } from "@/lib/coverage";
import { type CoveredElsewhere } from "@/lib/course-scope";

/**
 * Deterministic serializers for the coverage dataset the education team downloads
 * (R11). Pure — no DB, no LLM. Every file is self-describing (carries the method
 * note) so a committee can read it outside the app.
 */
export type CoverageExportRow = {
  framework: string; // "USMLE" | "AAMC"
  system: string; // organ system (USMLE) or competency domain (AAMC)
  topic: string; // framework label
  docs: number; // distinct documents addressing it
  courses: number; // distinct courses addressing it
  stableId?: string; // framework leaf stableId (USMLE), when the source carries it
  coveredElsewhere?: CoveredElsewhere; // unverified cross-course note (gaps only)
  detail?: string; // short scope hint from the node's fullText (disambiguates terse labels)
};

// Project only the canonical export columns — never spread the row. UI-only
// fields on CoverageExportRow (stableId, and the unverified coveredElsewhere
// note, KTD3) must not leak into the downloadable dataset: the export stays the
// deterministic counts dataset (R11), and CSV/JSON keep an identical shape.
const withLevel = (r: CoverageExportRow) => ({
  framework: r.framework,
  system: r.system,
  topic: r.topic,
  docs: r.docs,
  courses: r.courses,
  level: levelLabel(r.docs),
});

function csvCell(value: string | number): string {
  const s = String(value);
  // Neutralize spreadsheet formula injection: a cell starting with = + - @ (or
  // tab/CR) is auto-evaluated by Excel/Sheets. Defense-in-depth — export cells
  // are controlled framework data, but the team opens these in spreadsheets.
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** CSV with a leading method-note comment row, then a header row, then data. */
export function coverageRowsToCsv(rows: CoverageExportRow[]): string {
  const columns = ["framework", "system", "topic", "level", "documents", "courses"];
  const dataLines = rows.map((r) => {
    const wl = withLevel(r);
    return [wl.framework, wl.system, wl.topic, wl.level, wl.docs, wl.courses]
      .map(csvCell)
      .join(",");
  });
  // Quote the method note as one cell (it contains commas) so the first row
  // isn't ragged for strict CSV parsers.
  const noteRow = `"# ${METHOD_NOTE.replace(/"/g, '""')}"`;
  return [noteRow, columns.join(","), ...dataLines].join("\n");
}

/** JSON dataset with an embedded method block + one object per topic. */
export function coverageRowsToJson(rows: CoverageExportRow[], scope: string) {
  return {
    method: METHOD_NOTE,
    scope,
    topics: rows.map(withLevel),
  };
}
