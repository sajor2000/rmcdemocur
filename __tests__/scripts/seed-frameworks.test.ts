import { describe, expect, it } from "vitest";
import {
  assertUsmleStableIdLengths,
  dedupeUsmleByStableId,
} from "../../scripts/seed-frameworks";

describe("assertUsmleStableIdLengths", () => {
  it("accepts stable IDs at the column limit", () => {
    expect(() =>
      assertUsmleStableIdLengths([
        { stableId: "a".repeat(120), parentStableId: null },
      ]),
    ).not.toThrow();
  });

  it("throws when stableId exceeds 120 chars", () => {
    expect(() =>
      assertUsmleStableIdLengths([
        { stableId: "a".repeat(121), parentStableId: null },
      ]),
    ).toThrow(/stableId exceeds 120/);
  });

  it("throws when parentStableId exceeds 120 chars", () => {
    expect(() =>
      assertUsmleStableIdLengths([
        { stableId: "usmle:ok", parentStableId: "b".repeat(121) },
      ]),
    ).toThrow(/parentStableId exceeds 120/);
  });
});

describe("dedupeUsmleByStableId", () => {
  it("keeps the first occurrence and collapses duplicate stableIds", () => {
    const rows = [
      { stableId: "usmle:a", domain: "first" },
      { stableId: "usmle:b", domain: "second" },
      { stableId: "usmle:a", domain: "dupe-dropped" },
    ];
    const deduped = dedupeUsmleByStableId(rows);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((r) => r.stableId)).toEqual(["usmle:a", "usmle:b"]);
    // first wins — the later duplicate is discarded
    expect(deduped[0].domain).toBe("first");
  });

  it("returns the same rows when there are no duplicates", () => {
    const rows = [{ stableId: "usmle:a" }, { stableId: "usmle:b" }];
    expect(dedupeUsmleByStableId(rows)).toHaveLength(2);
  });
});
