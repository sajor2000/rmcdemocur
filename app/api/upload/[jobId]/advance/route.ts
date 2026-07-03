export const maxDuration = 300;

import { NextResponse } from "next/server";
import { advanceJob } from "@/lib/pipeline";
import {
  checkRateLimit,
  clientRateLimitKey,
} from "@/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: { jobId: string } },
) {
  const rateKey = clientRateLimitKey(request, "upload-advance");
  if (!checkRateLimit(rateKey, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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
