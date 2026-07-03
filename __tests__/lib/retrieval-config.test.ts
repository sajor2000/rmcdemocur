import { afterEach, describe, expect, it } from "vitest";
import {
  resolveMaxDistance,
  resolveMinSimilarity,
  passesDistance,
  passesSimilarity,
} from "@/lib/retrieval-config";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("resolveMaxDistance", () => {
  it("defaults to null (off) when unset", () => {
    delete process.env.RETRIEVAL_MAX_DISTANCE;
    expect(resolveMaxDistance()).toBeNull();
  });

  it("defaults to null (off) when invalid", () => {
    process.env.RETRIEVAL_MAX_DISTANCE = "not-a-number";
    expect(resolveMaxDistance()).toBeNull();
    process.env.RETRIEVAL_MAX_DISTANCE = "-1";
    expect(resolveMaxDistance()).toBeNull();
  });

  it("parses a valid positive float", () => {
    process.env.RETRIEVAL_MAX_DISTANCE = "0.55";
    expect(resolveMaxDistance()).toBe(0.55);
  });
});

describe("resolveMinSimilarity", () => {
  it("defaults to null (off) when unset", () => {
    delete process.env.SEARCH_MIN_SIMILARITY;
    expect(resolveMinSimilarity()).toBeNull();
  });

  it("parses a valid similarity in [0,1]", () => {
    process.env.SEARCH_MIN_SIMILARITY = "0.45";
    expect(resolveMinSimilarity()).toBe(0.45);
  });

  it("rejects out-of-range values", () => {
    process.env.SEARCH_MIN_SIMILARITY = "1.5";
    expect(resolveMinSimilarity()).toBeNull();
  });
});

describe("passesDistance (default-off regression guard)", () => {
  it("keeps everything when threshold is null", () => {
    expect(passesDistance(0.99, null)).toBe(true);
    expect(passesDistance(0.01, null)).toBe(true);
  });

  it("filters rows beyond the floor when set", () => {
    expect(passesDistance(0.4, 0.55)).toBe(true);
    expect(passesDistance(0.6, 0.55)).toBe(false);
  });
});

describe("passesSimilarity (default-off regression guard)", () => {
  it("keeps everything when threshold is null", () => {
    expect(passesSimilarity(0.01, null)).toBe(true);
  });

  it("filters rows below the floor when set", () => {
    expect(passesSimilarity(0.5, 0.45)).toBe(true);
    expect(passesSimilarity(0.4, 0.45)).toBe(false);
  });
});
