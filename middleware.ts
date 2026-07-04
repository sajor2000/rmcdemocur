import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  DEFAULT_TOKEN_TTL_SECONDS,
  signToken,
  tokenSecondsRemaining,
  verifyBearer,
  verifyToken,
} from "@/lib/api-auth";

// Re-issue the session cookie only when it has less than this much life left,
// so an active browsing session slides forward without re-signing every request.
const RENEW_WHEN_UNDER_SECONDS = 5 * 60;

export async function middleware(request: NextRequest) {
  const apiSecret = process.env.API_SECRET?.trim();

  // No secret configured (dev default): everything open, exactly as before.
  if (!apiSecret) return NextResponse.next();

  const nowSeconds = Date.now() / 1000;
  const existingCookie = request.cookies.get(AUTH_COOKIE)?.value;

  if (!request.nextUrl.pathname.startsWith("/api/")) {
    // Page navigation: ensure the browser holds a fresh signed session cookie so
    // its subsequent /api/* calls — including EventSource, which cannot send
    // headers — authenticate automatically on the same origin.
    const response = NextResponse.next();
    // Reissue when the cookie is missing, near expiry, or fails signature
    // verification (e.g. after an API_SECRET rotation — expiry alone would let a
    // stale-secret cookie suppress re-minting while every /api call 401s).
    const nearExpiry =
      tokenSecondsRemaining(existingCookie, nowSeconds) < RENEW_WHEN_UNDER_SECONDS;
    const valid =
      !nearExpiry &&
      existingCookie !== undefined &&
      (await verifyToken(existingCookie, apiSecret, nowSeconds));
    if (!valid) {
      const token = await signToken(apiSecret, nowSeconds);
      response.cookies.set(AUTH_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: DEFAULT_TOKEN_TTL_SECONDS,
      });
    }
    return response;
  }

  // /api/*: require the raw-secret bearer (server-to-server) or a valid session
  // cookie (browser fetch + EventSource).
  if (verifyBearer(request.headers.get("authorization"), apiSecret)) {
    return NextResponse.next();
  }
  if (existingCookie && (await verifyToken(existingCookie, apiSecret, nowSeconds))) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  // Run on API routes (to enforce) and page routes (to issue the cookie),
  // skipping static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
