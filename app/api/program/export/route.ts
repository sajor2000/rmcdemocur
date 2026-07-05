import { NextRequest, NextResponse } from "next/server";
import { getCoverageExportRows } from "@/lib/queries";
import { coverageRowsToCsv, coverageRowsToJson } from "@/lib/coverage-export";

export const dynamic = "force-dynamic";

/** GET /api/program/export?format=csv|json — the full-curriculum coverage dataset. */
export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
  try {
    const rows = await getCoverageExportRows();
    if (format === "json") {
      return NextResponse.json(coverageRowsToJson(rows, "Entire curriculum"), {
        headers: { "Content-Disposition": 'attachment; filename="program-coverage.json"' },
      });
    }
    return new NextResponse(coverageRowsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="program-coverage.csv"',
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to export coverage" }, { status: 500 });
  }
}
