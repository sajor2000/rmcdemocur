// Page/slide boundary marker — shared by parser, chunker, and objectives.
// Unicode Private Use Area codepoint; absent from real document text.
export const PAGE_BREAK_MARKER = "\uE000";

export function documentHasPageMarkers(text: string): boolean {
  return text.includes(PAGE_BREAK_MARKER);
}

export function countPageMarkersBefore(text: string, charOffset: number): number {
  let count = 0;
  let idx = 0;
  while (idx < charOffset) {
    const found = text.indexOf(PAGE_BREAK_MARKER, idx);
    if (found === -1 || found >= charOffset) break;
    count++;
    idx = found + PAGE_BREAK_MARKER.length;
  }
  return count;
}

/** 1-based page/slide index at a character offset, or null when the doc has no markers. */
export function sourcePageAtCharOffset(text: string, charOffset: number): number | null {
  if (!documentHasPageMarkers(text)) return null;
  return 1 + countPageMarkersBefore(text, charOffset);
}

/** 0-based line index in the full document text. */
export function charOffsetAtLine(text: string, lineIndex: number): number {
  if (lineIndex <= 0) return 0;
  let line = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      if (line >= lineIndex) return i + 1;
    } else if (text[i] === "\r") {
      line++;
      if (line >= lineIndex) {
        return text[i + 1] === "\n" ? i + 2 : i + 1;
      }
      if (text[i + 1] === "\n") i++;
    }
  }
  return text.length;
}

export function stripPageBreakMarkers(text: string): string {
  return text.split(PAGE_BREAK_MARKER).join("");
}

export function formatSourcePageLabel(
  filename: string,
  sourcePage: number | null | undefined,
): string | null {
  if (sourcePage == null) return null;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return `Page ${sourcePage}`;
  if (lower.endsWith(".pptx")) return `Slide ${sourcePage}`;
  return null;
}
