import { describe, expect, it } from "vitest";
import {
  signToken,
  verifyToken,
  verifyBearer,
  timingSafeEqual,
  tokenSecondsRemaining,
} from "@/lib/api-auth";

const SECRET = "test-secret-value";
const NOW = 1_800_000_000;

describe("timingSafeEqual", () => {
  it("returns true for equal strings, false otherwise", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("signToken / verifyToken", () => {
  it("mints a verifiable, non-secret token", async () => {
    const token = await signToken(SECRET, NOW, 600);
    expect(token).not.toBe(SECRET);
    expect(await verifyToken(token, SECRET, NOW)).toBe(true);
  });

  it("rejects an expired token", async () => {
    const token = await signToken(SECRET, NOW, 600);
    expect(await verifyToken(token, SECRET, NOW + 601)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await signToken(SECRET, NOW, 600);
    const tampered = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    expect(await verifyToken(tampered, SECRET, NOW)).toBe(false);
  });

  it("rejects a token minted with a different secret", async () => {
    const token = await signToken("other-secret", NOW, 600);
    expect(await verifyToken(token, SECRET, NOW)).toBe(false);
  });

  it("never accepts the raw secret as a token", async () => {
    expect(await verifyToken(SECRET, SECRET, NOW)).toBe(false);
  });
});

describe("tokenSecondsRemaining", () => {
  it("returns remaining lifetime for a valid token", async () => {
    const token = await signToken(SECRET, NOW, 600);
    expect(tokenSecondsRemaining(token, NOW)).toBe(600);
    expect(tokenSecondsRemaining(token, NOW + 500)).toBe(100);
  });

  it("returns 0 for expired, missing, or malformed tokens", () => {
    expect(tokenSecondsRemaining(undefined, NOW)).toBe(0);
    expect(tokenSecondsRemaining("garbage", NOW)).toBe(0);
  });
});

describe("verifyBearer", () => {
  it("accepts the exact secret with Bearer prefix", () => {
    expect(verifyBearer(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects wrong secret, missing prefix, or null", () => {
    expect(verifyBearer(`Bearer wrong`, SECRET)).toBe(false);
    expect(verifyBearer(SECRET, SECRET)).toBe(false);
    expect(verifyBearer(null, SECRET)).toBe(false);
  });
});
