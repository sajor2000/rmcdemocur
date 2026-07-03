import { NextResponse } from "next/server";
import { getCourseSummary } from "@/lib/queries";

export async function GET(
  _request: Request,
  { params }: { params: { courseId: string } },
) {
  try {
    const summary = await getCourseSummary(Number(params.courseId));
    if (!summary) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }
    return NextResponse.json(summary);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load summary" },
      { status: 500 },
    );
  }
}
