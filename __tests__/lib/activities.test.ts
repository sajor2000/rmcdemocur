import { describe, expect, it } from "vitest";
import {
  activityKeyOf,
  isActivityless,
  rollupActivities,
  UNASSIGNED_ACTIVITY,
  type ActivityAlignmentRow,
} from "@/lib/activities";

describe("activityKeyOf (U6)", () => {
  it("normalizes activity headings to a stable key", () => {
    expect(activityKeyOf("Activity 3: Metabolism of fats")).toBe("Activity 3");
    expect(activityKeyOf("Activity 3")).toBe("Activity 3");
    expect(activityKeyOf("activity 2a — intro")).toBe("Activity 2A");
    expect(activityKeyOf("ACTIVITY 10: overview")).toBe("Activity 10");
  });

  it("returns null for non-activity sections", () => {
    expect(activityKeyOf("Learning Objectives")).toBeNull();
    expect(activityKeyOf("Case 3")).toBeNull();
    expect(activityKeyOf("")).toBeNull();
    expect(activityKeyOf(null)).toBeNull();
    expect(activityKeyOf(undefined)).toBeNull();
  });
});

describe("rollupActivities (U6)", () => {
  const rows: ActivityAlignmentRow[] = [
    { section: "Activity 1: Intro", chunkId: 1, frameworkId: "usmle:a" },
    { section: "Activity 1: Intro", chunkId: 1, frameworkId: "usmle:b" }, // same chunk, 2nd topic
    { section: "Activity 1: Intro", chunkId: 2, frameworkId: "usmle:a" }, // repeat topic, new chunk
    { section: "Activity 2: Deep dive", chunkId: 3, frameworkId: "usmle:c" },
    { section: "Learning Objectives", chunkId: 4, frameworkId: "usmle:d" },
    { section: null, chunkId: 5, frameworkId: null },
  ];

  it("groups chunks and distinct topics per activity", () => {
    const result = rollupActivities(rows);
    const a1 = result.find((r) => r.activity === "Activity 1");
    expect(a1).toEqual({ activity: "Activity 1", chunks: 2, topics: 2 });
    const a2 = result.find((r) => r.activity === "Activity 2");
    expect(a2).toEqual({ activity: "Activity 2", chunks: 1, topics: 1 });
  });

  it("buckets non-activity sections under Unassigned, sorted last", () => {
    const result = rollupActivities(rows);
    const unassigned = result.find((r) => r.activity === UNASSIGNED_ACTIVITY);
    expect(unassigned?.chunks).toBe(2); // chunks 4 and 5
    expect(unassigned?.topics).toBe(1); // only usmle:d (null frameworkId ignored)
    expect(result[result.length - 1].activity).toBe(UNASSIGNED_ACTIVITY);
  });

  it("sorts activities numerically, not lexicographically", () => {
    const many: ActivityAlignmentRow[] = [
      { section: "Activity 10: x", chunkId: 1, frameworkId: "u:1" },
      { section: "Activity 2: y", chunkId: 2, frameworkId: "u:2" },
    ];
    const result = rollupActivities(many);
    expect(result.map((r) => r.activity)).toEqual(["Activity 2", "Activity 10"]);
  });

  it("detects an activityless case", () => {
    expect(isActivityless(rollupActivities([{ section: "Objectives", chunkId: 1, frameworkId: "u:1" }]))).toBe(true);
    expect(isActivityless(rollupActivities([]))).toBe(true);
    expect(isActivityless(rollupActivities(rows))).toBe(false);
  });
});
