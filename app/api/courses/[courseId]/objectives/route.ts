import { NextResponse } from "next/server";
import { getCourseObjectivesSummary } from "@/lib/queries";

export async function GET(
  _request: Request,
  { params }: { params: { courseId: string } },
) {
  const courseId = Number(params.courseId);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Invalid course id" }, { status: 400 });
  }

  try {
    const summary = await getCourseObjectivesSummary(courseId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load objectives" },
      { status: 500 },
    );
  }
}
