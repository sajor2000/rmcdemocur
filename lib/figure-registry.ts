import {
  type DocumentFigureMeta,
  type FigureRegistryEntry,
  inferExtractionScope,
  inferGuideKind,
} from "@/lib/media-types";

export const ANSWER_IMAGE_RE =
  /^Answer\s+(?:Image|Figure)\s*(?:\d+[A-Z]?)?\s*:?\s*(.*)$/i;
// \d+(?:\.\d+)? allows decimal figure numbers ("Figure 8.2", "Figure 26.1") —
// common in this corpus as textbook citations (e.g. "Figure 8.2, Devlin").
// Without the optional decimal group, "Figure 8.2" truncates to label
// "Figure 8", colliding with any other "Figure 8" (or "Figure 8.3") elsewhere
// in the same document.
export const FIGURE_LABEL_RE = /^(?:FIGURE|Figure)\s+(\d+(?:\.\d+)?[A-Z]?)\s*:?\s*(.*)$/i;
const PROVIDED_IMAGE_RE = /^Provided image\s*:?\s*(.*)$/i;
const YOUTUBE_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i;
const WATCH_VIDEO_RE = /Watch this video/i;

function normalizeLines(text: string): string[] {
  return text.split(/\n/).map((line) => line.trim()).filter(Boolean);
}

function isFigureLabelLine(line: string): boolean {
  return (
    ANSWER_IMAGE_RE.test(line) ||
    FIGURE_LABEL_RE.test(line) ||
    PROVIDED_IMAGE_RE.test(line) ||
    WATCH_VIDEO_RE.test(line) ||
    YOUTUBE_RE.test(line)
  );
}

function extractCaptionFromContext(
  lines: string[],
  startIndex: number,
  inlineTail: string,
): { hasCaption: boolean; textForEmbed: string | null } {
  const parts: string[] = [];
  if (inlineTail.trim().length >= 8) {
    parts.push(inlineTail.trim());
  }

  for (let i = startIndex + 1; i < Math.min(startIndex + 4, lines.length); i++) {
    const line = lines[i];
    if (isFigureLabelLine(line)) break;
    if (/^(Rationale|Explanation|Clinician Educators|Faculty contacts)/i.test(line)) {
      parts.push(line);
      continue;
    }
    if (/^[A-Z0-9][A-Z0-9\s/-]{4,}$/.test(line)) {
      parts.push(line);
      continue;
    }
    if (line.length >= 20) {
      parts.push(line);
    }
  }

  const textForEmbed = parts.length ? parts.join(" ").trim().slice(0, 2000) : null;
  const hasCaption = Boolean(textForEmbed && textForEmbed.length >= 8);
  return { hasCaption, textForEmbed };
}

function makeLabel(kind: FigureRegistryEntry["referenceKind"], raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (kind === "answer_image") {
    return cleaned.replace(/^Answer\s+(?:Image|Figure)\s*/i, "Answer Image ").trim();
  }
  return cleaned;
}

export function buildDocumentFigureMeta(
  filename: string,
  fileType: "pdf" | "docx" | "pptx",
  caseNumber: number,
): DocumentFigureMeta {
  return {
    filename,
    caseNumber,
    fileType,
    guideKind: inferGuideKind(filename),
  };
}

export function buildFigureRegistry(
  text: string,
  meta: DocumentFigureMeta,
): FigureRegistryEntry[] {
  const lines = normalizeLines(text);
  const extractionScope = inferExtractionScope(meta);
  const entries: FigureRegistryEntry[] = [];
  let answerImageOrdinal = 0;
  // Content figures ("Figure N") are often mentioned several times in
  // surrounding prose ("as Figure 8.2 shows...") in addition to their actual
  // caption. Every mention still becomes its own registry entry (each one's
  // own hasCaptionInText/textForEmbed is captured independently), but all
  // occurrences of the same label share one stable, non-null sourceIndex
  // (assigned in first-occurrence order) — this is what lets an extraction
  // step correlate a specific label to a specific embedded image, since a
  // shared null sourceIndex carries no positional information at all.
  const figureOrdinalByLabel = new Map<string, number>();
  let nextFigureOrdinal = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const section = lines.slice(Math.max(0, i - 3), i).find((l) => l.length < 120) ?? null;

    const youtubeMatch = line.match(YOUTUBE_RE);
    if (youtubeMatch || WATCH_VIDEO_RE.test(line)) {
      const url = youtubeMatch
        ? line.match(/https?:\/\/[^\s]+/i)?.[0] ?? `https://youtu.be/${youtubeMatch[1]}`
        : lines.slice(i, i + 2).join(" ").match(/https?:\/\/[^\s]+/i)?.[0] ?? null;
      entries.push({
        label: url ? `Video: ${url}` : "Watch this video",
        referenceKind: "video",
        section,
        lineIndex: i,
        hasCaptionInText: Boolean(url),
        textForEmbed: url,
        extractionScope,
        sourceIndex: null,
        type: "video",
        videoUrl: url,
      });
      continue;
    }

    const answerMatch = line.match(ANSWER_IMAGE_RE);
    if (answerMatch) {
      answerImageOrdinal += 1;
      const { hasCaption, textForEmbed } = extractCaptionFromContext(
        lines,
        i,
        answerMatch[1] ?? "",
      );
      entries.push({
        label: makeLabel("answer_image", line.split(":")[0] ?? line),
        referenceKind: "answer_image",
        section,
        lineIndex: i,
        hasCaptionInText: hasCaption,
        textForEmbed,
        extractionScope,
        sourceIndex: answerImageOrdinal,
        type: "figure",
      });
      continue;
    }

    const figureMatch = line.match(FIGURE_LABEL_RE);
    if (figureMatch) {
      const label = `Figure ${figureMatch[1]}`;
      if (!figureOrdinalByLabel.has(label)) {
        nextFigureOrdinal += 1;
        figureOrdinalByLabel.set(label, nextFigureOrdinal);
      }
      const { hasCaption, textForEmbed } = extractCaptionFromContext(
        lines,
        i,
        figureMatch[2] ?? "",
      );
      entries.push({
        label,
        referenceKind: "figure",
        section,
        lineIndex: i,
        hasCaptionInText: hasCaption,
        textForEmbed,
        extractionScope,
        sourceIndex: figureOrdinalByLabel.get(label)!,
        type: "figure",
      });
      continue;
    }

    const providedMatch = line.match(PROVIDED_IMAGE_RE);
    if (providedMatch) {
      const { hasCaption, textForEmbed } = extractCaptionFromContext(
        lines,
        i,
        providedMatch[1] ?? "",
      );
      entries.push({
        label: "Provided image",
        referenceKind: "provided_image",
        section,
        lineIndex: i,
        hasCaptionInText: hasCaption,
        textForEmbed,
        extractionScope,
        sourceIndex: null,
        type: "figure",
      });
    }
  }

  return entries;
}

export function labelMentionedInText(label: string, content: string): boolean {
  const normalizedContent = content.toLowerCase();
  const normalizedLabel = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalizedContent.includes(normalizedLabel)) return true;

  const answerNum = /answer\s+(?:image|figure)\s*(\d+[a-z]?)/i.exec(label);
  if (answerNum) {
    const pattern = new RegExp(`answer\\s+(?:image|figure)\\s*${answerNum[1]}`, "i");
    return pattern.test(content);
  }

  const figureNum = /figure\s+(\d+[a-z]?)/i.exec(label);
  if (figureNum) {
    return new RegExp(`figure\\s+${figureNum[1]}\\b`, "i").test(content);
  }

  return false;
}
