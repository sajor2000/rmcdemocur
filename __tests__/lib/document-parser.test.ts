import { describe, expect, it } from "vitest";
import { buildPdfPageTexts } from "@/lib/document-parser";

// Tests buildPdfPageTexts directly against a fake pdf.js-shaped document --
// the seam extractPdfTextByPage's require("pdfjs-dist/...") call was split
// out to, specifically so this doesn't need a real PDF binary fixture or a
// mock of pdfjs-dist's CJS require (vi.mock does not reliably intercept a
// runtime `require()` call — verified: it fell through to the real library).
function mockPdfDoc(pagesItems: { str: string; transform: number[] }[][]) {
  return {
    numPages: pagesItems.length,
    getPage: async (pageNum: number) => ({
      getTextContent: async () => ({ items: pagesItems[pageNum - 1] }),
    }),
  };
}

const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y] });

describe("buildPdfPageTexts (per-page \\f marker source)", () => {
  it("returns one page text for a single-page document", async () => {
    const doc = mockPdfDoc([[item("Hello world", 10, 100)]]);
    const pages = await buildPdfPageTexts(doc);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("Hello world");
  });

  it("returns one text entry per page, in order, for a multi-page document", async () => {
    const doc = mockPdfDoc([
      [item("Page one text", 10, 100)],
      [item("Page two text", 10, 100)],
      [item("Page three text", 10, 100)],
    ]);
    const pages = await buildPdfPageTexts(doc);
    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain("Page one");
    expect(pages[1]).toContain("Page two");
    expect(pages[2]).toContain("Page three");
  });

  it("still returns a (blank) entry for a page with no extractable text, not skipped", async () => {
    const doc = mockPdfDoc([
      [item("Page one text", 10, 100)],
      [], // image-only page, no text runs
      [item("Page three text", 10, 100)],
    ]);
    const pages = await buildPdfPageTexts(doc);
    expect(pages).toHaveLength(3);
    expect(pages[1]).toBe("");
  });
});
