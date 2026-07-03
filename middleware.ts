import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const apiSecret = process.env.API_SECRET?.trim();
  if (!apiSecret || !request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // EventSource cannot send Authorization headers — allow GET polling routes.
  if (request.method === "GET") {
    return NextResponse.next();
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${apiSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
