import fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { groupTextRunsIntoLines } from "@/lib/pdf-figure-images";
import { PAGE_BREAK_MARKER } from "@/lib/source-page";

export { PAGE_BREAK_MARKER };

export type ParsedDocument = {
  text: string;
  fileType: "pdf" | "docx" | "pptx";
};

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
    return { text: await extractPptxTextBySlide(data), fileType: "pptx" };
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".pptx"];
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

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
  // Surrounding newlines keep the last line of one page and the first line
  // of the next from merging into a single line lib/chunker.ts's heading
  // detection has to parse -- without them, a heading immediately after a
  // page break could fail to be recognized as a heading.
  return pageTexts.join(`\n${PAGE_BREAK_MARKER}\n`);
}

// Matches officeparser's own internal slide-discovery pattern exactly
// (node_modules/officeparser/officeParser.js ~106-108) -- officeparser
// extracts per-slide text internally but joins every slide into one string
// before its public API returns, with no option to get the boundary back.
const SLIDE_FILE_REGEX = /ppt\/slides\/slide\d+\.xml$/;
const SLIDE_NUMBER_REGEX = /slide(\d+)\.xml$/;

/**
 * Extracts a slide's text, mirroring officeparser's own approach: gather
 * `<a:p>` (paragraph) nodes, skip ones with no `<a:t>` (text run) children,
 * join a paragraph's text runs directly (no separator -- they are typically
 * split mid-word/phrase), and join paragraphs with newlines. A real XML
 * parse (not a bare regex over `<a:t>`) so nested/self-closing/attribute
 * variations in the OOXML don't silently drop or duplicate text.
 */
function extractSlideText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const paragraphs = Array.from(doc.getElementsByTagName("a:p"));
  return paragraphs
    .filter((p) => p.getElementsByTagName("a:t").length > 0)
    .map((p) =>
      Array.from(p.getElementsByTagName("a:t"))
        .map((t) => t.firstChild?.nodeValue ?? "")
        .join(""),
    )
    .join("\n");
}

/**
 * Builds one text string per slide from a slideNumber -> slide XML map.
 * Separated from extractPptxTextBySlide's unzip step so the sorting +
 * XML-extraction logic -- the actual slide-boundary logic U2 needs to get
 * right -- is unit-testable with plain XML strings, no real .pptx binary
 * needed.
 */
export function buildPptxSlideTexts(slideXmlByNumber: Map<number, string>): string[] {
  return Array.from(slideXmlByNumber.entries())
    .sort(([a], [b]) => a - b)
    .map(([, xml]) => extractSlideText(xml));
}

async function extractPptxTextBySlide(data: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const slideXmlByNumber = new Map<number, string>();
  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (!SLIDE_FILE_REGEX.test(entryPath)) continue;
    const slideNumber = Number(entryPath.match(SLIDE_NUMBER_REGEX)?.[1]);
    if (Number.isNaN(slideNumber)) continue;
    slideXmlByNumber.set(slideNumber, await entry.async("string"));
  }
  const slideTexts = buildPptxSlideTexts(slideXmlByNumber);
  return slideTexts.join(`\n${PAGE_BREAK_MARKER}\n`);
}
