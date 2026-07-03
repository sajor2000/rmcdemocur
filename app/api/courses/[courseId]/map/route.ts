import { NextResponse } from "next/server";
import { getMapData } from "@/lib/queries";

export async function GET(
  _request: Request,
  { params }: { params: { courseId: string } },
) {
  try {
    const data = await getMapData(Number(params.courseId));
    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load map" }, { status: 500 });
  }
}
