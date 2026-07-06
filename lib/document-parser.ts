import fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import { groupTextRunsIntoLines } from "@/lib/pdf-figure-images";

export type ParsedDocument = {
  text: string;
  fileType: "pdf" | "docx" | "pptx";
};

// Page/slide boundary marker (form feed) inserted between pages (PDF) or
// slides (PPTX) so lib/chunker.ts and lib/objective-extractor.ts can each
// independently count markers up to their own text position to compute a
// sourcePage, without a separate offset-map data structure. DOCX has no page
// concept and never contains this marker. Never stored — every consumer
// strips it before persisting content.
export const PAGE_BREAK_MARKER = "\f";

export async function parseDocument(
  filePath: string,
  buffer?: Buffer,
): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase();
  const data = buffer ?? (await fs.readFile(filePath));

  if (ext === ".pdf") {
    return { text: await extractPdfTextByPage(data), fileType: "pdf" };
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer: data });
    return { text: result.value, fileType: "docx" };
  }

  if (ext === ".pptx") {
    const { parseOfficeAsync } = await import("officeparser");
    const text = await parseOfficeAsync(data);
    return { text: String(text), fileType: "pptx" };
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".pptx"];
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Per-page PDF text via pdfjs-dist (already a dependency, used elsewhere for
 * figure extraction) instead of pdf-parse's single flat string -- pdf-parse
 * has no page boundaries to give U1/R1/R3 a page number to report. Reuses
 * pdf-figure-images.ts's groupTextRunsIntoLines for the same line
 * reconstruction from positioned text runs, rather than a second
 * implementation of that logic.
 */
type PdfjsDocument = {
  numPages: number;
  getPage: (pageNum: number) => Promise<{
    getTextContent: () => Promise<{ items: { str: string; transform: number[] }[] }>;
  }>;
};

/**
 * Builds one text string per page from an already-opened pdf.js document.
 * Separated from extractPdfTextByPage's `require(...)`/`getDocument(...)`
 * call so this loop -- the actual page-boundary logic U1 needs to get
 * right -- is unit-testable against a plain fake document object, without
 * needing a real PDF binary fixture or intercepting pdfjs-dist's CJS
 * `require` (vi.mock does not reliably intercept a runtime `require()` call).
 */
export async function buildPdfPageTexts(doc: PdfjsDocument): Promise<string[]> {
  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const runs = textContent.items
      .filter((item) => item.str.length > 0)
      .map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5] }));
    const lines = groupTextRunsIntoLines(runs);
    pageTexts.push(lines.map((l) => l.text).join("\n"));
  }
  return pageTexts;
}

/**
 * Per-page PDF text via pdfjs-dist (already a dependency, used elsewhere for
 * figure extraction) instead of pdf-parse's single flat string -- pdf-parse
 * has no page boundaries to give U1/R1/R3 a page number to report.
 */
async function extractPdfTextByPage(data: Buffer): Promise<string> {
  // 3.11.174 pin matches pdf-figure-images.ts -- see that file's comment;
  // this module doesn't render pages so the node-canvas regression there
  // doesn't apply here, but staying on one pinned version avoids carrying
  // two pdfjs-dist builds.
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js") as typeof import("pdfjs-dist/legacy/build/pdf.js");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
  const pageTexts = await buildPdfPageTexts(doc as unknown as PdfjsDocument);
  return pageTexts.join(PAGE_BREAK_MARKER);
}
