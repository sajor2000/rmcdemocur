import { NextResponse } from "next/server";
import { getGapExportRows } from "@/lib/queries";
import { coverageRowsToCsv, coverageRowsToJson } from "@/lib/coverage-export";

export async function GET(
  request: Request,
  { params }: { params: { courseId: string } },
) {
  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "csv";
  try {
    const rows = await getGapExportRows(Number(params.courseId));
    if (format === "json") {
      return NextResponse.json(coverageRowsToJson(rows, `Course ${params.courseId}`), {
        headers: {
          "Content-Disposition": `attachment; filename="gap-report-course-${params.courseId}.json"`,
        },
      });
    }
    return new NextResponse(coverageRowsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gap-report-course-${params.courseId}.csv"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
