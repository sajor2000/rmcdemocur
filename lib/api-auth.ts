/**
 * API authentication (U8). When API_SECRET is set, every /api/* route requires a
 * credential: either the raw secret as a bearer (server-to-server) or a
 * short-lived HMAC-signed token the browser can hold. The token is delivered as
 * a same-origin cookie so EventSource — which cannot send Authorization headers —
 * still authenticates. The token is never equal to API_SECRET.
 *
 * HMAC uses Web Crypto (available in both edge middleware and the Node runtime).
 */

export const AUTH_COOKIE = "rmcmap_api_token";
export const DEFAULT_TOKEN_TTL_SECONDS = 30 * 60;

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
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

/** Mint `{scope}.{expEpochSeconds}.{hmac}`. Never returns a value equal to secret. */
export async function signToken(
  secret: string,
  scope: string,
  nowSeconds: number,
  ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS,
): Promise<string> {
  const exp = Math.floor(nowSeconds) + ttlSeconds;
  const message = `${scope}.${exp}`;
  const sig = await hmacHex(secret, message);
  return `${message}.${sig}`;
}

/** Verify signature (constant-time), expiry, and optional scope. */
export async function verifyToken(
  token: string,
  secret: string,
  nowSeconds: number,
  expectedScope?: string,
): Promise<boolean> {
  if (!token || token === secret) return false;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return false;
  const message = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);

  const expectedSig = await hmacHex(secret, message);
  if (!timingSafeEqual(sig, expectedSig)) return false;

  const [scope, expRaw] = message.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= Math.floor(nowSeconds)) return false;
  if (expectedScope !== undefined && scope !== expectedScope) return false;
  return true;
}

/** Constant-time bearer check against the raw secret. */
export function verifyBearer(authHeader: string | null, secret: string): boolean {
  if (!authHeader) return false;
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;
  return timingSafeEqual(authHeader.slice(prefix.length), secret);
}
