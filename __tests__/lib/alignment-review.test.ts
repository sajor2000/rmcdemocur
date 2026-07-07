import { describe, expect, it } from "vitest";
import {
  countsTowardCoverage,
  hasReviewedAlignment,
  isReviewedStatus,
} from "@/lib/alignment-review";

describe("isReviewedStatus", () => {
  it("is true only for approved/rejected", () => {
    expect(isReviewedStatus("approved")).toBe(true);
    expect(isReviewedStatus("rejected")).toBe(true);
    expect(isReviewedStatus("pending")).toBe(false);
    expect(isReviewedStatus(null)).toBe(false);
    expect(isReviewedStatus(undefined)).toBe(false);
  });
});

describe("hasReviewedAlignment (realign preservation, U3)", () => {
  it("flags a chunk that carries any faculty decision so realign skips it", () => {
    expect(hasReviewedAlignment(["pending", "approved"])).toBe(true);
    expect(hasReviewedAlignment(["rejected"])).toBe(true);
  });
  it("returns false when every alignment is pending or NULL (safe to re-align)", () => {
    expect(hasReviewedAlignment(["pending", "pending"])).toBe(false);
    expect(hasReviewedAlignment([null, "pending"])).toBe(false);
    expect(hasReviewedAlignment([])).toBe(false);
  });
});

describe("countsTowardCoverage (U5 rule mirror)", () => {
  it("excludes only explicit rejections; pending/approved/NULL count", () => {
    expect(countsTowardCoverage("rejected")).toBe(false);
    expect(countsTowardCoverage("pending")).toBe(true);
    expect(countsTowardCoverage("approved")).toBe(true);
    expect(countsTowardCoverage(null)).toBe(true); // null-safe, mirrors IS DISTINCT FROM
  });
});
