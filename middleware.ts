import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  DEFAULT_TOKEN_TTL_SECONDS,
  signToken,
  verifyBearer,
  verifyToken,
} from "@/lib/api-auth";

const SESSION_SCOPE = "session";

export async function middleware(request: NextRequest) {
  const apiSecret = process.env.API_SECRET?.trim();

  // No secret configured (dev default): everything open, exactly as before.
  if (!apiSecret) return NextResponse.next();

  const nowSeconds = Date.now() / 1000;
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (!isApi) {
    // Page navigation: issue a short-lived signed session cookie so the browser's
    // subsequent /api/* calls — including EventSource, which cannot send headers —
    // authenticate automatically on the same origin.
    const response = NextResponse.next();
    const token = await signToken(apiSecret, SESSION_SCOPE, nowSeconds);
    response.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEFAULT_TOKEN_TTL_SECONDS,
    });
    return response;
  }

  // /api/*: require a valid credential.
  // 1. Raw secret bearer (server-to-server).
  if (verifyBearer(request.headers.get("authorization"), apiSecret)) {
    return NextResponse.next();
  }
  // 2. Minted session cookie (browser fetch + EventSource).
  const cookieToken = request.cookies.get(AUTH_COOKIE)?.value;
  if (cookieToken && (await verifyToken(cookieToken, apiSecret, nowSeconds, SESSION_SCOPE))) {
    return NextResponse.next();
  }
  // 3. Explicit ?token= query param (per-link access).
  const queryToken = request.nextUrl.searchParams.get("token");
  if (queryToken && (await verifyToken(queryToken, apiSecret, nowSeconds, SESSION_SCOPE))) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  // Run on API routes (to enforce) and page routes (to issue the cookie),
  // skipping static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
