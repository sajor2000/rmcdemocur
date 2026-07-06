import { NextResponse } from "next/server";
import { getCaseAnalytics } from "@/lib/queries";

export async function GET(
  _request: Request,
  { params }: { params: { courseId: string; caseNumber: string } },
) {
  const courseId = Number(params.courseId);
  const caseNumber = Number(params.caseNumber);

  if (!Number.isFinite(courseId) || !Number.isFinite(caseNumber)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const data = await getCaseAnalytics(courseId, caseNumber);
    if (!data) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load case analytics" }, { status: 500 });
  }
}
