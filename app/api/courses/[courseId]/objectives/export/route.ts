import { NextResponse } from "next/server";
import { getObjectivesExportRows } from "@/lib/queries";
import {
  objectivesRowsToCsv,
  objectivesRowsToJson,
  summarizeObjectivesExportRows,
} from "@/lib/objectives-export";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { courseId: string } },
) {
  const courseId = Number(params.courseId);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
  }

  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "csv";

  try {
    const rows = await getObjectivesExportRows({ courseId });
    const summary = summarizeObjectivesExportRows(rows);
    const scope =
      rows[0]?.courseCode != null
        ? `Course ${rows[0].courseCode}`
        : `Course ${courseId}`;

    if (format === "json") {
      return NextResponse.json(objectivesRowsToJson(rows, scope, summary), {
        headers: {
          "Content-Disposition": `attachment; filename="objectives-course-${courseId}.json"`,
        },
      });
    }

    return new NextResponse(objectivesRowsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="objectives-course-${courseId}.csv"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
