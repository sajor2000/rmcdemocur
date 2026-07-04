import { describe, expect, it } from "vitest";
import { deriveCoverageStatus } from "@/lib/gap-analyzer";

describe("deriveCoverageStatus", () => {
  it("marks zero chunks as gap", () => {
    expect(deriveCoverageStatus(0, 0)).toBe("gap");
  });

  it("marks high confidence as covered", () => {
    expect(deriveCoverageStatus(3, 0.85)).toBe("covered");
  });

  it("marks partial for low confidence with chunks", () => {
    expect(deriveCoverageStatus(1, 0.3)).toBe("partial");
    expect(deriveCoverageStatus(2, 0.6)).toBe("partial");
  });

  it("marks covered at confidence threshold boundary", () => {
    expect(deriveCoverageStatus(1, 0.8)).toBe("covered");
  });
});
