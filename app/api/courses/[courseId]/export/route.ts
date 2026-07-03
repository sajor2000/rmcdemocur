import { NextResponse } from "next/server";
import { getGapExportRows } from "@/lib/queries";

export async function GET(
  _request: Request,
  { params }: { params: { courseId: string } },
) {
  try {
    const rows = await getGapExportRows(Number(params.courseId));
    const header =
      "framework,framework_id,label,coverage_status,chunk_count,avg_confidence,case_title";
    const body = rows
      .map((r) =>
        [
          r.framework,
          r.frameworkId,
          `"${(r.frameworkLabel ?? "").replace(/"/g, '""')}"`,
          r.coverageStatus,
          r.chunkCount,
          r.avgConfidence,
          `"${(r.caseTitle ?? "").replace(/"/g, '""')}"`,
        ].join(","),
      )
      .join("\n");

    return new NextResponse(`${header}\n${body}`, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="gap-report-course-${params.courseId}.csv"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
