import { NextResponse } from "next/server";
import { getCourseObjectivesSummary } from "@/lib/queries";
import { DEMO_OBJECTIVES } from "@/lib/demo-data";

export async function GET(
  _request: Request,
  { params }: { params: { courseId: string } },
) {
  const courseId = Number(params.courseId);

  try {
    const summary = await getCourseObjectivesSummary(courseId);
    return NextResponse.json(summary);
  } catch {
    return NextResponse.json(DEMO_OBJECTIVES);
  }
}
