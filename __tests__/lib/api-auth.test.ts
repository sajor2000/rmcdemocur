import { describe, expect, it } from "vitest";
import {
  signToken,
  verifyToken,
  verifyBearer,
  timingSafeEqual,
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
    const token = await signToken(SECRET, "session", NOW, 600);
    expect(token).not.toBe(SECRET);
    expect(await verifyToken(token, SECRET, NOW, "session")).toBe(true);
  });

  it("rejects an expired token", async () => {
    const token = await signToken(SECRET, "session", NOW, 600);
    expect(await verifyToken(token, SECRET, NOW + 601, "session")).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await signToken(SECRET, "session", NOW, 600);
    const tampered = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    expect(await verifyToken(tampered, SECRET, NOW, "session")).toBe(false);
  });

  it("rejects a token minted with a different secret", async () => {
    const token = await signToken("other-secret", "session", NOW, 600);
    expect(await verifyToken(token, SECRET, NOW, "session")).toBe(false);
  });

  it("rejects a scope mismatch", async () => {
    const token = await signToken(SECRET, "stream:5", NOW, 600);
    expect(await verifyToken(token, SECRET, NOW, "stream:9")).toBe(false);
    expect(await verifyToken(token, SECRET, NOW, "stream:5")).toBe(true);
  });

  it("never accepts the raw secret as a token", async () => {
    expect(await verifyToken(SECRET, SECRET, NOW)).toBe(false);
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
