import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ObjectivesExportRow } from "@/lib/objectives-export";

const getObjectivesExportRows = vi.hoisted(() => vi.fn());

vi.mock("@/lib/queries", () => ({
  getObjectivesExportRows,
}));

import { GET as getCourseObjectivesExport } from "@/app/api/courses/[courseId]/objectives/export/route";
import { GET as getProgramObjectivesExport } from "@/app/api/program/objectives/export/route";

const sampleRow: ObjectivesExportRow = {
  module: "M1",
  courseCode: "RMD 563",
  courseTitle: "Food to Fuel",
  caseNumber: 1,
  caseTitle: "Case 1",
  ordinal: 1,
  objectiveCode: "EO-0001",
  objective: "Describe glucose metabolism",
  section: "Learning Objectives",
  extractionMethod: "regex",
  confidence: "high",
  sourceFilename: "case1-self-study.pdf",
  sourcePage: null,
  sourceExcerpt: "EO-0001 Describe glucose metabolism",
  objectiveId: 1,
  documentId: 10,
};

describe("GET /api/courses/[courseId]/objectives/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getObjectivesExportRows.mockResolvedValue([sampleRow]);
  });

  it("returns 400 for an invalid course id", async () => {
    const res = await getCourseObjectivesExport(
      new Request("http://localhost/api/courses/0/objectives/export"),
      { params: { courseId: "0" } },
    );
    expect(res.status).toBe(400);
    expect(getObjectivesExportRows).not.toHaveBeenCalled();
  });

  it("returns CSV with attachment headers for a valid course", async () => {
    const res = await getCourseObjectivesExport(
      new Request("http://localhost/api/courses/1/objectives/export?format=csv"),
      { params: { courseId: "1" } },
    );
    expect(res.status).toBe(200);
    expect(getObjectivesExportRows).toHaveBeenCalledWith({ courseId: 1 });
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/objectives-course-1\.csv/);
    const body = await res.text();
    expect(body).toMatch(/extracted directly/i);
    expect(body).toContain("EO-0001");
  });

  it("returns JSON with attachment disposition when format=json", async () => {
    const res = await getCourseObjectivesExport(
      new Request("http://localhost/api/courses/1/objectives/export?format=json"),
      { params: { courseId: "1" } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/objectives-course-1\.json/);
    const body = await res.json();
    expect(body.scope).toBe("Course RMD 563");
    expect(body.objectives).toHaveLength(1);
  });
});

describe("GET /api/program/objectives/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getObjectivesExportRows.mockResolvedValue([sampleRow]);
  });

  it("passes module filter to the query layer", async () => {
    const res = await getProgramObjectivesExport(
      new NextRequest("http://localhost/api/program/objectives/export?format=csv&module=M1"),
    );
    expect(res.status).toBe(200);
    expect(getObjectivesExportRows).toHaveBeenCalledWith({ module: "M1" });
    expect(res.headers.get("Content-Disposition")).toMatch(/objectives-program-M1\.csv/);
  });

  it("omits module filter when module=all", async () => {
    await getProgramObjectivesExport(
      new NextRequest("http://localhost/api/program/objectives/export?format=json&module=all"),
    );
    expect(getObjectivesExportRows).toHaveBeenCalledWith({ module: undefined });
  });
});
