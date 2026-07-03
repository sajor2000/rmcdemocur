import { describe, expect, it } from "vitest";
import { assertUsmleStableIdLengths } from "../../scripts/seed-frameworks";

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
