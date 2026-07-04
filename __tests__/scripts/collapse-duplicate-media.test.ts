import { describe, expect, it, vi } from "vitest";
import { collapseDuplicateMediaAssets, countDuplicateMediaGroups } from "@/scripts/collapse-duplicate-media";

function fakeSql(counts: number[]) {
  let call = 0;
  const sql = vi.fn(() => Promise.resolve([{ n: counts[Math.min(call++, counts.length - 1)] }]));
  const transaction = vi.fn(() => Promise.resolve(undefined));
  return Object.assign(sql, { transaction }) as unknown as Parameters<typeof collapseDuplicateMediaAssets>[0];
}

describe("countDuplicateMediaGroups", () => {
  it("returns the duplicate-group count from the query", async () => {
    const sql = fakeSql([3]);
    await expect(countDuplicateMediaGroups(sql)).resolves.toBe(3);
  });

  it("returns 0 when the query yields no row", async () => {
    const sql = vi.fn(() => Promise.resolve([])) as unknown as Parameters<typeof countDuplicateMediaGroups>[0];
    await expect(countDuplicateMediaGroups(sql)).resolves.toBe(0);
  });
});

describe("collapseDuplicateMediaAssets", () => {
  it("no-ops without running the transaction when there are no duplicates", async () => {
    const sql = fakeSql([0]);

    const result = await collapseDuplicateMediaAssets(sql);

    expect(result).toEqual({ groupsCollapsed: 0 });
    expect((sql as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction).not.toHaveBeenCalled();
  });

  it("runs the 4-statement transaction batch and reports the collapsed count", async () => {
    const sql = fakeSql([2, 0]); // before: 2 groups, after: 0 groups

    const result = await collapseDuplicateMediaAssets(sql);

    expect(result).toEqual({ groupsCollapsed: 2 });
    const transaction = (sql as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction;
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][0]).toHaveLength(4);
  });

  it("throws if duplicates remain after the transaction commits", async () => {
    const sql = fakeSql([2, 1]); // before: 2 groups, after: 1 group still remains

    await expect(collapseDuplicateMediaAssets(sql)).rejects.toThrow(/duplicate group\(s\) remain/);
  });
});
