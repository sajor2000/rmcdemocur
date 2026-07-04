import { describe, expect, it } from "vitest";
import { rollUpCoverageStatus, deriveUsmleSystem } from "@/lib/queries";

describe("rollUpCoverageStatus", () => {
  it("covered only when every subdomain is covered", () => {
    expect(rollUpCoverageStatus(3, 0, 3)).toBe("covered");
  });

  it("gap when nothing is covered or partial", () => {
    expect(rollUpCoverageStatus(0, 0, 5)).toBe("gap");
  });

  it("partial when some (but not all) coverage exists", () => {
    expect(rollUpCoverageStatus(1, 2, 4)).toBe("partial");
    expect(rollUpCoverageStatus(0, 2, 4)).toBe("partial");
    expect(rollUpCoverageStatus(2, 0, 4)).toBe("partial");
  });

  it("gap when there is nothing to roll up", () => {
    expect(rollUpCoverageStatus(0, 0, 0)).toBe("gap");
  });
});

describe("deriveUsmleSystem", () => {
  it("takes the system name before the em-dash separator", () => {
    expect(
      deriveUsmleSystem("Cardiovascular System — Neoplasms", "cardiovascular-system"),
    ).toBe("Cardiovascular System");
  });

  it("falls back to a prettified slug when the label has no separator", () => {
    expect(deriveUsmleSystem("", "nervous-system-and-special-senses")).toBe(
      "Nervous System And Special Senses",
    );
  });
});
