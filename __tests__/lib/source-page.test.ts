import { describe, expect, it } from "vitest";
import { PAGE_BREAK_MARKER } from "@/lib/document-parser";
import {
  charOffsetAtLine,
  formatSourcePageLabel,
  sourcePageAtCharOffset,
  stripPageBreakMarkers,
} from "@/lib/source-page";

describe("source-page helpers", () => {
  it("counts markers before a character offset", () => {
    const text = `a${PAGE_BREAK_MARKER}b${PAGE_BREAK_MARKER}c`;
    expect(sourcePageAtCharOffset(text, 0)).toBe(1);
    expect(sourcePageAtCharOffset(text, text.indexOf("b"))).toBe(2);
    expect(sourcePageAtCharOffset(text, text.length)).toBe(3);
  });

  it("returns null when the document has no page markers", () => {
    expect(sourcePageAtCharOffset("plain docx text", 5)).toBeNull();
  });

  it("maps line index to character offset", () => {
    const text = "line0\nline1\nline2";
    expect(charOffsetAtLine(text, 0)).toBe(0);
    expect(charOffsetAtLine(text, 1)).toBe(6);
    expect(charOffsetAtLine(text, 2)).toBe(12);
  });

  it("formats Page vs Slide from filename extension", () => {
    expect(formatSourcePageLabel("guide.pdf", 4)).toBe("Page 4");
    expect(formatSourcePageLabel("deck.pptx", 7)).toBe("Slide 7");
    expect(formatSourcePageLabel("notes.docx", 2)).toBeNull();
    expect(formatSourcePageLabel("guide.pdf", null)).toBeNull();
  });

  it("strips page break markers from stored text", () => {
    expect(stripPageBreakMarkers(`a${PAGE_BREAK_MARKER}b`)).toBe("ab");
  });
});
