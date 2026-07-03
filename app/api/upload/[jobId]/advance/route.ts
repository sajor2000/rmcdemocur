export const maxDuration = 60;

import { NextResponse } from "next/server";
import { advanceJob } from "@/lib/pipeline";

export async function POST(
  _request: Request,
  { params }: { params: { jobId: string } },
) {
  try {
    const job = await advanceJob(Number(params.jobId));
    return NextResponse.json(job);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Advance failed" },
      { status: 500 },
    );
  }
}
