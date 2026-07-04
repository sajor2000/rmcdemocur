/**
 * API authentication (U8). When API_SECRET is set, every /api/* route requires a
 * credential: either the raw secret as a bearer (server-to-server) or a
 * short-lived HMAC-signed token the browser holds. The token is delivered as a
 * same-origin cookie so EventSource — which cannot send Authorization headers —
 * still authenticates. The token is never equal to API_SECRET.
 *
 * HMAC uses Web Crypto (available in both edge middleware and the Node runtime).
 */

export const AUTH_COOKIE = "rmcmap_api_token";
// Must exceed the SSE stream route's 3600s watch budget, or an idle upload page
// loses API access mid-job when the cookie expires with no renewal navigation.
export const DEFAULT_TOKEN_TTL_SECONDS = 2 * 60 * 60;

const encoder = new TextEncoder();

// API_SECRET is constant for the process lifetime, so import the HMAC key once
// per secret rather than on every sign/verify (middleware runs per request).
const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    keyCache.set(secret, key);
  }
  return key;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await getKey(secret), encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison of two equal-purpose strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Mint `{expEpochSeconds}.{hmac}`. Never returns a value equal to secret. */
export async function signToken(
  secret: string,
  nowSeconds: number,
  ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS,
): Promise<string> {
  const exp = Math.floor(nowSeconds) + ttlSeconds;
  const sig = await hmacHex(secret, String(exp));
  return `${exp}.${sig}`;
}

/** Verify signature (constant-time) and expiry. */
export async function verifyToken(
  token: string,
  secret: string,
  nowSeconds: number,
): Promise<boolean> {
  if (!token || token === secret) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expRaw = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expectedSig = await hmacHex(secret, expRaw);
  if (!timingSafeEqual(sig, expectedSig)) return false;

  const exp = Number(expRaw);
  return Number.isFinite(exp) && exp > Math.floor(nowSeconds);
}

/** Seconds until the token expires; 0 if invalid/expired (ignores signature). */
export function tokenSecondsRemaining(token: string | undefined, nowSeconds: number): number {
  if (!token) return 0;
  const dot = token.indexOf(".");
  if (dot <= 0) return 0;
  const exp = Number(token.slice(0, dot));
  return Number.isFinite(exp) ? Math.max(0, exp - Math.floor(nowSeconds)) : 0;
}

/** Constant-time bearer check against the raw secret. */
export function verifyBearer(authHeader: string | null, secret: string): boolean {
  if (!authHeader) return false;
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;
  return timingSafeEqual(authHeader.slice(prefix.length), secret);
}
