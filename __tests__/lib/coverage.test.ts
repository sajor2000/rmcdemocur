import { describe, expect, it } from "vitest";
import { levelOf, distribution, heatmapCellStatus, LEVELS, METHOD_NOTE } from "@/lib/coverage";

describe("levelOf (document-count thresholds)", () => {
  it("maps boundaries to the Introduced -> Reinforced -> Mastered spectrum", () => {
    expect(levelOf(0)).toBe("gap");
    expect(levelOf(-1)).toBe("gap");
    expect(levelOf(1)).toBe("introduced");
    expect(levelOf(2)).toBe("reinforced");
    expect(levelOf(3)).toBe("reinforced");
    expect(levelOf(4)).toBe("strong");
    expect(levelOf(7)).toBe("strong");
    expect(levelOf(8)).toBe("heavy");
    expect(levelOf(50)).toBe("heavy");
  });
});

describe("distribution", () => {
  it("returns all gaps for no addressed topics", () => {
    const d = distribution([], 100);
    expect(d).toMatchObject({ total: 100, addressed: 0, gap: 100, substantive: 0 });
  });

  it("buckets counts and keeps addressed + gap === total", () => {
    // 1 introduced, 2 reinforced (2,3), 1 strong (5), 1 heavy (9) = 5 addressed
    const d = distribution([1, 2, 3, 5, 9], 20);
    expect(d.introduced).toBe(1);
    expect(d.reinforced).toBe(2);
    expect(d.strong).toBe(1);
    expect(d.heavy).toBe(1);
    expect(d.addressed).toBe(5);
    expect(d.substantive).toBe(4); // >= 2 docs
    expect(d.gap).toBe(15);
    expect(d.addressed + d.gap).toBe(d.total);
  });

  it("clamps gap at zero when addressed exceeds a stale total", () => {
    expect(distribution([1, 1, 1], 2).gap).toBe(0);
  });
});

describe("level metadata", () => {
  it("every level has an educator tooltip and a color", () => {
    for (const l of LEVELS) {
      expect(l.tooltip.length).toBeGreaterThan(10);
      expect(l.colorClass).toMatch(/^bg-/);
    }
  });

  it("exposes a plain-language method note mentioning faculty review", () => {
    expect(METHOD_NOTE).toMatch(/faculty review/i);
    expect(METHOD_NOTE).toMatch(/document/i);
  });
});

describe("heatmapCellStatus (per-session, per-system breadth — KTD1)", () => {
  it("gap when nothing in the system was touched, or the system has no domains", () => {
    expect(heatmapCellStatus(0, 5)).toBe("gap");
    expect(heatmapCellStatus(3, 0)).toBe("gap");
  });

  it("covered once at least half the system's domains are touched", () => {
    expect(heatmapCellStatus(3, 6)).toBe("covered");
    expect(heatmapCellStatus(4, 6)).toBe("covered");
    expect(heatmapCellStatus(6, 6)).toBe("covered");
  });

  it("partial when some but fewer than half the system's domains are touched", () => {
    expect(heatmapCellStatus(1, 6)).toBe("partial");
    expect(heatmapCellStatus(2, 6)).toBe("partial");
  });

  it("is independently derived from breadth, not tuned to any single dataset", () => {
    // The rule is a plain fraction threshold — verify it holds at odd totals too.
    expect(heatmapCellStatus(1, 3)).toBe("partial");
    expect(heatmapCellStatus(2, 3)).toBe("covered");
  });
});
