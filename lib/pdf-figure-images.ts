import { createCanvas } from "canvas";
import { ANSWER_IMAGE_RE } from "@/lib/figure-registry";

// pdfjs-dist is pinned to 3.11.174, not the latest major, because the current
// 5.x release renders completely blank pages under node-canvas (verified:
// zero non-white pixels across a full page render, with no thrown error) --
// a real regression in pdfjs-dist's Node.js/node-canvas rendering path, not
// something this module's setup can work around. 3.11.174 is the last widely-
// used version confirmed to render real content in this same Node.js/
// node-canvas combination.

// Matches figure-registry.ts's inline-answer-image threshold semantics loosely
// -- we only need "does this text run look like the start of an Answer Image
// label," not full caption extraction (that already happens against the flat
// pdf-parse text elsewhere).
const RENDER_SCALE = 150 / 72; // ~150 DPI, matching the plan's stated target

// pdf.js creates its own internal canvases while compositing embedded images
// onto the page (not just the outer page canvas this module provides), and
// fails with "Image or Canvas expected" without a Node-compatible factory for
// those. This is pdf.js's own documented integration point for non-browser
// canvas implementations, not a workaround for a bug.
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(canvasAndContext: { canvas: ReturnType<typeof createCanvas> }, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext: { canvas: ReturnType<typeof createCanvas> | null; context: unknown }) {
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
    }
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

export type ExtractedAnswerImage = {
  /** Matches the sourceIndex figure-registry.ts's answerImageOrdinal counter
   * assigns to the same-order "Answer Image" occurrence in the flat
   * pdf-parse text -- a simple per-occurrence counter, not deduped by label,
   * since these labels are frequently generic ("Answer Image" with no
   * number) and do NOT identify a unique figure the way "Figure N" does. */
  answerImageOrdinal: number;
  page: number;
  bytes: Buffer;
  ext: "png";
};

type TextRun = { str: string; x: number; y: number };
export type ImageBox = { minX: number; minY: number; maxX: number; maxY: number };
export type PositionedLine = { text: string; x: number; y: number };

/**
 * Extracts a cropped PNG for every "Answer Image" occurrence in a PDF,
 * correlating each occurrence to the nearest embedded image on the same page
 * by vertical position. Renders each page to a canvas via pdf.js's official
 * Node rendering path (rather than reaching into pdf.js's internal XObject
 * representation) so the same code handles raster, vector, or flattened
 * content uniformly -- U9.0 confirmed every faculty answer-image page has at
 * least one real raster XObject, but rendering + cropping is robust
 * regardless, and pdf-parse (used elsewhere for chunk text) has no page or
 * image model at all, which is why this needs pdf.js specifically.
 */
export async function extractAnswerImages(buffer: Buffer): Promise<ExtractedAnswerImage[]> {
  // 3.11.174 ships a CommonJS build; there is no equivalent .mjs entry point
  // at this version, unlike current pdfjs-dist releases.
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js") as typeof import("pdfjs-dist/legacy/build/pdf.js");
  const data = new Uint8Array(buffer);
  // CanvasFactory is a real, documented pdfjs-dist option this version's own
  // shipped types simply don't declare (verified working at runtime above).
  const doc = await pdfjsLib.getDocument({ data, CanvasFactory: NodeCanvasFactory } as any).promise;

  const results: ExtractedAnswerImage[] = [];
  let answerImageOrdinal = 0;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const textContent = await page.getTextContent();
    const textRuns: TextRun[] = (textContent.items as { str: string; transform: number[] }[])
      .filter((item) => item.str.trim().length > 0)
      .map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5] }));

    // Group consecutive-by-position text runs into approximate lines (pdf.js
    // yields individual runs, not lines) so ANSWER_IMAGE_RE -- anchored with
    // ^ -- can match against something resembling a full line rather than a
    // single word fragment.
    const lines = groupTextRunsIntoLines(textRuns);
    const answerImageLines = lines.filter((line) => ANSWER_IMAGE_RE.test(line.text));
    if (answerImageLines.length === 0) continue;

    const imageBoxes = await findImageBoxes(page, pdfjsLib, viewport);
    if (imageBoxes.length === 0) {
      answerImageOrdinal += answerImageLines.length;
      continue;
    }

    // Render the full page once; every matched image on this page is a crop
    // of the same render. pdf.js's RenderParameters type assumes a DOM
    // CanvasRenderingContext2D; node-canvas's context is a structurally-
    // compatible polyfill, so the cast bridges two structurally-equivalent
    // Canvas API implementations, not a real type-safety gap. Passing only
    // canvasContext (no canvas key) is the configuration verified to actually
    // paint real content at this pdfjs-dist version -- passing canvas instead
    // rendered but a `canvas: null, canvasContext` combination did not error
    // yet still produced a blank page under an earlier pdfjs-dist version.
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    } as any).promise;

    const lineYs = answerImageLines.map((line) => viewport.convertToViewportPoint(line.x, line.y)[1]);
    const matches = correlateLinesToImageBoxes(lineYs, imageBoxes);

    for (let lineIdx = 0; lineIdx < answerImageLines.length; lineIdx++) {
      answerImageOrdinal += 1;
      const bestIdx = matches[lineIdx];
      if (bestIdx === null) continue;

      const box = imageBoxes[bestIdx];
      const w = Math.max(1, Math.round(box.maxX - box.minX));
      const h = Math.max(1, Math.round(box.maxY - box.minY));
      const crop = createCanvas(w, h);
      crop.getContext("2d").drawImage(
        canvas,
        box.minX,
        box.minY,
        w,
        h,
        0,
        0,
        w,
        h,
      );
      results.push({
        answerImageOrdinal,
        page: pageNum,
        bytes: crop.toBuffer("image/png"),
        ext: "png",
      });
    }
  }

  return results;
}

/**
 * Matches each "Answer Image" text line to the nearest not-yet-claimed image
 * box on the same page, by vertical (viewport-space) position. Returns one
 * entry per input line: the matched image box's index, or null when no
 * unclaimed box remains. Pure and exported for testing -- this is the logic
 * that correctly told apart two distinct images on the same page (a
 * colonoscopy photo and a separate pathology micrograph) during verification
 * against the real corpus, so it is the highest-value piece to have direct
 * test coverage on rather than only exercising it via a full PDF render.
 */
export function correlateLinesToImageBoxes(
  lineViewportYs: number[],
  imageBoxes: ImageBox[],
): (number | null)[] {
  const claimed = new Set<number>();
  const matches: (number | null)[] = [];

  for (const lineY of lineViewportYs) {
    let bestIdx: number | null = null;
    let bestDistance = Infinity;
    for (let i = 0; i < imageBoxes.length; i++) {
      if (claimed.has(i)) continue;
      const box = imageBoxes[i];
      const boxCenterY = (box.minY + box.maxY) / 2;
      const distance = Math.abs(boxCenterY - lineY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIdx = i;
      }
    }
    if (bestIdx !== null) claimed.add(bestIdx);
    matches.push(bestIdx);
  }

  return matches;
}

export function groupTextRunsIntoLines(runs: TextRun[]): PositionedLine[] {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { text: string; x: number; y: number }[] = [];
  const Y_TOLERANCE = 2;
  for (const run of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - run.y) <= Y_TOLERANCE) {
      last.text += run.str;
    } else {
      lines.push({ text: run.str, x: run.x, y: run.y });
    }
  }
  return lines.map((l) => ({ ...l, text: l.text.trim() }));
}

// viewport is typed `any` deliberately: pdfjs-dist's own shipped .d.ts files
// are unreliable in this exact area (the real PageViewport instance pdf.js
// hands back at runtime fails structural assignment against its own declared
// method signature here, and the sibling applyTransform function above is
// separately mistyped as returning void) -- fighting the library's own type
// surface isn't worth it for one narrow internal helper parameter whose real
// shape (convertToViewportRectangle(rect) -> [x0,y0,x1,y1]) is exercised and
// verified by this module's own tests against the real pdfjs-dist runtime.
async function findImageBoxes(
  page: { getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }> },
  pdfjsLib: typeof import("pdfjs-dist/legacy/build/pdf.js"),
  viewport: any,
): Promise<ImageBox[]> {
  const opList = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;
  const Util = pdfjsLib.Util;

  let ctm: number[] = [1, 0, 0, 1, 0, 0];
  const ctmStack: number[][] = [];
  const boxes: ImageBox[] = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    if (fn === OPS.save) {
      ctmStack.push([...ctm]);
    } else if (fn === OPS.restore) {
      ctm = ctmStack.pop() ?? ctm;
    } else if (fn === OPS.transform) {
      const args = opList.argsArray[i] as number[];
      ctm = Util.transform(ctm, args);
    } else if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
      // The CTM maps the unit square [0,1]x[0,1] to the image's placed
      // rectangle in PDF user space. Applied by hand (not pdf.js's own
      // Util.applyTransform) because that function's shipped .d.ts types it
      // as returning void, which doesn't match its actual behavior -- the
      // math itself is a standard 2D affine transform, [a,b,c,d,e,f] applied
      // to [x,y] as (a*x + c*y + e, b*x + d*y + f).
      const pdfCorners = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
      // convertToViewportRectangle doesn't exist on the installed pdfjs-dist
      // version's runtime PageViewport (confirmed by inspecting the actual
      // instance -- only convertToViewportPoint is present); converting each
      // corner individually and taking the bounding box is equivalent.
      const viewportCorners = pdfCorners.map(([x, y]) => viewport.convertToViewportPoint(x, y));
      const xs = viewportCorners.map((c: number[]) => c[0]);
      const ys = viewportCorners.map((c: number[]) => c[1]);
      boxes.push({
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      });
    }
  }

  return boxes;
}
