import { describe, expect, it } from "vitest";
import {
  isReviewedStatus,
  partitionOrphans,
  summarizeOrphans,
  type AlignmentRef,
} from "@/lib/framework-orphans";

const ref = (frameworkId: string, status: string | null, chunkId: number): AlignmentRef => ({
  frameworkId,
  status,
  chunkId,
});

describe("isReviewedStatus (U4)", () => {
  it("is true only for approved/rejected", () => {
    expect(isReviewedStatus("approved")).toBe(true);
    expect(isReviewedStatus("rejected")).toBe(true);
    expect(isReviewedStatus("pending")).toBe(false);
    expect(isReviewedStatus(null)).toBe(false);
  });
});

describe("partitionOrphans (U4)", () => {
  const valid = new Set(["usmle:gi:disorders-of-the-pancreas", "usmle:endo:thyroid"]);

  it("flags alignments whose framework_id is absent from the taxonomy", () => {
    const rows = [
      ref("usmle:gi:disorders-of-the-pancreas", "pending", 1), // valid
      ref("usmle:gi:old-garbled-fragment", "pending", 2), // orphan, unreviewed
      ref("usmle:gi:another-removed-node", "approved", 3), // orphan, reviewed
    ];
    const { unreviewed, reviewed } = partitionOrphans(rows, valid);
    expect(unreviewed.map((r) => r.chunkId)).toEqual([2]);
    expect(reviewed.map((r) => r.chunkId)).toEqual([3]);
  });

  it("does not flag valid alignments", () => {
    const rows = [ref("usmle:endo:thyroid", "approved", 9)];
    const { unreviewed, reviewed } = partitionOrphans(rows, valid);
    expect(unreviewed).toHaveLength(0);
    expect(reviewed).toHaveLength(0);
  });

  it("separates reviewed orphans so they are not silently dropped", () => {
    const rows = [
      ref("usmle:removed:a", "rejected", 4),
      ref("usmle:removed:a", "pending", 5),
    ];
    const { unreviewed, reviewed } = partitionOrphans(rows, valid);
    expect(reviewed).toHaveLength(1); // the rejected one needs re-review
    expect(unreviewed).toHaveLength(1);
  });
});

describe("summarizeOrphans (U4)", () => {
  it("aggregates by framework_id, most-frequent first", () => {
    const rows = [
      ref("usmle:x", null, 1),
      ref("usmle:x", null, 2),
      ref("usmle:y", null, 3),
    ];
    expect(summarizeOrphans(rows)).toEqual([
      { frameworkId: "usmle:x", count: 2 },
      { frameworkId: "usmle:y", count: 1 },
    ]);
  });
});
