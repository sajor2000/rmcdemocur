import { describe, expect, it } from "vitest";
import {
  courseCodesForModule,
  courseModule,
  curatedCourseCodesWithModule,
} from "@/lib/course-scope";

describe("course module helpers", () => {
  it("maps RMD 563 to M1", () => {
    expect(courseModule("RMD 563")).toBe("M1");
    expect(courseCodesForModule("M1")).toContain("RMD 563");
  });

  it("returns empty codes for unknown modules", () => {
    expect(courseCodesForModule("M99")).toEqual([]);
  });

  it("lists curated codes for Unassigned SQL filter", () => {
    expect(curatedCourseCodesWithModule()).toContain("RMD 563");
  });
});
