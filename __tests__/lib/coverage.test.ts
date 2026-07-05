import { describe, expect, it } from "vitest";
import { levelOf, distribution, LEVELS, METHOD_NOTE } from "@/lib/coverage";

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
