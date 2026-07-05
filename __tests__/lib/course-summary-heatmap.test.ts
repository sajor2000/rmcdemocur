import { describe, expect, it } from "vitest";
import { buildCourseHeatmap } from "@/lib/queries";

describe("buildCourseHeatmap (U1 — AE1 regression guard)", () => {
  it("buckets a case's document as covered when it touches most of a system's domains", () => {
    const totals = new Map([["Gastrointestinal System", 6]]);
    const result = buildCourseHeatmap(
      [{ case_number: 1, system: "Gastrointestinal System", domains_touched: 4 }],
      totals,
    );
    expect(result).toEqual([
      { caseNumber: 1, system: "Gastrointestinal System", status: "covered" },
    ]);
  });

  it("buckets a case's document as partial when it touches few of a system's domains", () => {
    const totals = new Map([["Endocrine System", 6]]);
    const result = buildCourseHeatmap(
      [{ case_number: 1, system: "Endocrine System", domains_touched: 1 }],
      totals,
    );
    expect(result[0].status).toBe("partial");
  });

  it("produces a real mix of statuses across cases and systems (not all-red — PR #8)", () => {
    const totals = new Map([
      ["Gastrointestinal System", 6],
      ["Endocrine System", 6],
    ]);
    const rows = [
      { case_number: 1, system: "Gastrointestinal System", domains_touched: 5 },
      { case_number: 1, system: "Endocrine System", domains_touched: 1 },
      { case_number: 2, system: "Gastrointestinal System", domains_touched: 3 },
    ];
    const statuses = new Set(buildCourseHeatmap(rows, totals).map((r) => r.status));
    expect(statuses.size).toBeGreaterThan(1);
    expect(statuses.has("gap")).toBe(false);
  });

  it("falls back to gap when the system string has no matching total (catalog join miss)", () => {
    // Documented, known behavior: if a row's `system` (resolved via
    // COALESCE(usmle_domains.domain, label-parsed fallback) in the query)
    // doesn't match any key in domainsTotalBySystem, the total is 0 and
    // heatmapCellStatus always returns "gap" — regardless of domains_touched.
    // This is the seam a future catalog/label mismatch would hit; guarding it
    // here makes the failure mode visible instead of silent.
    const totals = new Map([["Gastrointestinal System", 6]]);
    const result = buildCourseHeatmap(
      [{ case_number: 1, system: "Some Unmatched System Label", domains_touched: 5 }],
      totals,
    );
    expect(result[0].status).toBe("gap");
  });

  it("returns an empty heatmap for no rows", () => {
    expect(buildCourseHeatmap([], new Map())).toEqual([]);
  });
});
