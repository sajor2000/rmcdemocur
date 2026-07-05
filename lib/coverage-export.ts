import { levelLabel, METHOD_NOTE } from "@/lib/coverage";

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
};

const withLevel = (r: CoverageExportRow) => ({ ...r, level: levelLabel(r.docs) });

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
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
  return [`# ${METHOD_NOTE}`, columns.join(","), ...dataLines].join("\n");
}

/** JSON dataset with an embedded method block + one object per topic. */
export function coverageRowsToJson(rows: CoverageExportRow[], scope: string) {
  return {
    method: METHOD_NOTE,
    scope,
    topics: rows.map(withLevel),
  };
}
