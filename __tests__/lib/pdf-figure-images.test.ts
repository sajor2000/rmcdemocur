import { describe, expect, it } from "vitest";
import { correlateLinesToImageBoxes, groupTextRunsIntoLines } from "@/lib/pdf-figure-images";

describe("correlateLinesToImageBoxes", () => {
  it("matches a single label to the single nearby image", () => {
    const matches = correlateLinesToImageBoxes(
      [100],
      [{ minX: 0, minY: 90, maxX: 50, maxY: 110 }],
    );
    expect(matches).toEqual([0]);
  });

  it("matches two labels on the same page to two distinct images, not the same one twice", () => {
    // Mirrors the real verification case: two "Answer Image" mentions on one
    // PDF page, each nearest to a different embedded image (a colonoscopy
    // photo and a separate pathology micrograph).
    const boxes = [
      { minX: 0, minY: 50, maxX: 100, maxY: 150 }, // center 100
      { minX: 0, minY: 400, maxX: 100, maxY: 500 }, // center 450
    ];
    const matches = correlateLinesToImageBoxes([110, 440], boxes);
    expect(matches).toEqual([0, 1]);
  });

  it("does not reuse an already-claimed image for a second, farther label", () => {
    // Only one image box exists; two labels compete for it. The first label
    // (processed in input order) claims it; the second gets null rather than
    // the same box, since a decorative reuse of one image for two distinct
    // registry rows would attach the wrong figure to one of them.
    const boxes = [{ minX: 0, minY: 90, maxX: 50, maxY: 110 }];
    const matches = correlateLinesToImageBoxes([100, 105], boxes);
    expect(matches).toEqual([0, null]);
  });

  it("returns null for a label with no image boxes on the page at all", () => {
    const matches = correlateLinesToImageBoxes([100], []);
    expect(matches).toEqual([null]);
  });

  it("picks the closer of two images by vertical distance", () => {
    const boxes = [
      { minX: 0, minY: 0, maxX: 50, maxY: 20 }, // center 10, far from label at 500
      { minX: 0, minY: 490, maxX: 50, maxY: 510 }, // center 500, exact match
    ];
    const matches = correlateLinesToImageBoxes([500], boxes);
    expect(matches).toEqual([1]);
  });
});

describe("groupTextRunsIntoLines", () => {
  it("merges text runs at the same y-position into one line", () => {
    const lines = groupTextRunsIntoLines([
      { str: "Answer ", x: 10, y: 100 },
      { str: "Image:", x: 60, y: 100 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Answer Image:");
  });

  it("keeps runs at meaningfully different y-positions as separate lines", () => {
    const lines = groupTextRunsIntoLines([
      { str: "Line one", x: 10, y: 100 },
      { str: "Line two", x: 10, y: 50 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(["Line one", "Line two"]);
  });

  it("orders lines top-to-bottom (descending PDF y) regardless of input order", () => {
    const lines = groupTextRunsIntoLines([
      { str: "Bottom", x: 10, y: 20 },
      { str: "Top", x: 10, y: 200 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(["Top", "Bottom"]);
  });

  it("returns an empty array for no input runs", () => {
    expect(groupTextRunsIntoLines([])).toEqual([]);
  });
});
