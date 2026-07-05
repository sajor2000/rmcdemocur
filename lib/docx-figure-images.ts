import mammoth from "mammoth";
import { FIGURE_LABEL_RE } from "@/lib/figure-registry";

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/x-emf": "emf",
  "image/x-wmf": "wmf",
  "image/webp": "webp",
};

// Below this size, an "image" found near a Figure-N label is almost always a
// decorative bullet/watermark/icon reused throughout the document, not the
// actual content figure — empirically ~70-125 bytes for repeated in-text
// mentions vs 20KB+ for genuine diagrams/photos (validated against a real
// RMD 563 self-study guide, where "Figure 8.2" is referenced 5 times in prose
// but embeds only one real image).
const MIN_FIGURE_IMAGE_BYTES = 2000;

// A Figure-N label is searched for a candidate image within this many lines
// on either side, since the actual embedded image usually sits immediately
// before or after its caption line, not always on the exact same line mammoth
// reports the marker on.
const SEARCH_WINDOW_LINES = 6;

export type LabeledFigureImage = {
  /** Matches the sourceIndex buildFigureRegistry assigns this label (first-
   * occurrence order, shared across every repeated mention of the label). */
  figureOrdinal: number;
  label: string;
  bytes: Buffer;
  ext: string;
};

/**
 * Extracts the best-guess image for every uniquely-labeled "Figure N" in a
 * DOCX, correlating by document position rather than raw zip entry order —
 * the docx's word/media/ zip listing does not reliably match reading order
 * (verified: 384 of 391 entries out of numeric sequence in a real self-study
 * guide), so ordinal-matching against the raw zip is unsafe.
 *
 * Approach: mammoth's image handler visits embedded images in true reading
 * order during HTML conversion, so replacing each image with a unique text
 * marker lets a plain-text scan re-discover each image's position relative to
 * surrounding paragraph text (including "Figure N" label lines) without needing
 * any zip-level file access at all.
 */
export async function extractLabeledFigureImages(
  buffer: Buffer,
): Promise<LabeledFigureImage[]> {
  let ordinal = 0;
  const collected: { marker: string; bytes: Buffer; ext: string }[] = [];

  const imageHandler = mammoth.images.imgElement((image) => {
    ordinal += 1;
    const marker = `@@DOCX_IMG_${ordinal}@@`;
    return image.read().then((buf) => {
      collected.push({
        marker,
        bytes: buf as Buffer,
        ext: CONTENT_TYPE_EXT[image.contentType] ?? "bin",
      });
      return { src: marker };
    });
  });

  const result = await mammoth.convertToHtml({ buffer }, { convertImage: imageHandler });
  const lines = htmlToMarkedLines(result.value);

  const markerRe = /^@@DOCX_IMG_(\d+)@@$/;
  const occurrencesByLabel = new Map<string, number[]>();
  const orderedLabels: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(FIGURE_LABEL_RE);
    if (!match) continue;
    const label = `Figure ${match[1]}`;
    if (!occurrencesByLabel.has(label)) {
      occurrencesByLabel.set(label, []);
      orderedLabels.push(label);
    }
    occurrencesByLabel.get(label)!.push(i);
  }

  const results: LabeledFigureImage[] = [];
  let figureOrdinal = 0;
  for (const label of orderedLabels) {
    figureOrdinal += 1;
    let best: { bytes: Buffer; ext: string } | null = null;

    for (const lineIndex of occurrencesByLabel.get(label)!) {
      for (let w = 1; w <= SEARCH_WINDOW_LINES; w++) {
        for (const idx of [lineIndex + w, lineIndex - w]) {
          if (idx < 0 || idx >= lines.length) continue;
          const markerMatch = lines[idx].match(markerRe);
          if (!markerMatch) continue;
          const img = collected.find((c) => c.marker === `@@DOCX_IMG_${markerMatch[1]}@@`);
          if (img && img.bytes.length >= MIN_FIGURE_IMAGE_BYTES) {
            if (!best || img.bytes.length > best.bytes.length) best = img;
          }
        }
      }
    }

    if (best) {
      results.push({ figureOrdinal, label, bytes: best.bytes, ext: best.ext });
    }
  }

  return results;
}

/** Strip mammoth's HTML output to line-separated plain text, preserving each
 * image marker on its own line so position-based matching against figure
 * labels stays simple. Not a general-purpose HTML-to-text converter — only
 * needs to preserve marker/label line adjacency, not formatting fidelity. */
function htmlToMarkedLines(html: string): string[] {
  const text = html
    .replace(/<img[^>]*src="([^"]+)"[^>]*\/?>/g, "\n$1\n")
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}
