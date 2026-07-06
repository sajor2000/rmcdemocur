import { NextRequest, NextResponse } from "next/server";
import { getObjectivesExportRows } from "@/lib/queries";
import {
  objectivesRowsToCsv,
  objectivesRowsToJson,
  summarizeObjectivesExportRows,
} from "@/lib/objectives-export";

export const dynamic = "force-dynamic";

/** GET /api/program/objectives/export?format=csv|json&module=all|M1|M2|Unassigned */
export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
  const moduleParam = request.nextUrl.searchParams.get("module");
  const moduleFilter =
    moduleParam && moduleParam !== "all" ? moduleParam : undefined;

  try {
    const rows = await getObjectivesExportRows({ module: moduleFilter });
    const summary = summarizeObjectivesExportRows(rows);
    const scope = moduleFilter ? `Module ${moduleFilter}` : "Entire curriculum";

    if (format === "json") {
      return NextResponse.json(objectivesRowsToJson(rows, scope, summary), {
        headers: {
          "Content-Disposition": `attachment; filename="objectives-program${moduleFilter ? `-${moduleFilter}` : ""}.json"`,
        },
      });
    }

    return new NextResponse(objectivesRowsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="objectives-program${moduleFilter ? `-${moduleFilter}` : ""}.csv"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to export objectives" }, { status: 500 });
  }
}
