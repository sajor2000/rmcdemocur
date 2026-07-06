import {
  charOffsetAtLine,
  sourcePageAtCharOffset,
  stripPageBreakMarkers,
} from "@/lib/source-page";

export type ExtractedObjective = {
  text: string;
  ordinal: number;
  sectionHeading: string;
  sourceLineStart: number;
  sourceExcerpt: string;
  extractionMethod: "regex" | "llm_cleanup";
  confidence: "high" | "medium" | "low";
  eoCode?: string;
  sourcePage?: number | null;
};

export type ObjectiveSection = {
  heading: string;
  startLine: number;
  endLine: number;
  excerpt: string;
};

const OBJECTIVE_SECTION_PATTERNS = [
  /^Case\s+Specific\s+Objectives/i,
  /^Learning\s+Objectives?/i,
  /^Session\s+Objectives?/i,
  /^Course\s+Objectives?/i,
  /^Learning\s+Goals?/i,
  /^Objectives?\s*[:*]?$/i,
  /^Upon\s+completion.*you\s+(will|should)\s+be\s+able/i,
];

const SECTION_END_PATTERNS = [
  /^Activity\s+\d+/i,
  /^Take-Home\s+Points/i,
  /^Case\s+\d+/i,
  /^Session\s+Assessment/i,
  /^Overview$/i,
  /^Introduction$/i,
  /^Before\s+attending/i,
  /^Discipline\s+Director/i,
  /^Suggested\s+Schedule/i,
  /^TABLE\s+OF\s+CONTENTS/i,
  /^Credits$/i,
  /^Pre-brief/i,
  /^BREAK/i,
  /^In\s+case\s+of\s+technical/i,
  /^Faculty\s+should/i,
  /^Slide\s+\d+/i,
  /^[A-Z][A-Za-z0-9\s,;:'()/-]+\(TO-\d{4}\)\s*$/,
];

const INTRO_LINE_PATTERNS = [
  /^At\s+the\s+end\s+of\s+this\s+section/i,
  /^Upon\s+completion/i,
  /^Students?\s+will\s+be\s+able\s+to/i,
  /^By\s+the\s+end\s+of/i,
  /^These\s+objectives\s+are\s+integral/i,
  /^Review\s+prior\s+to\s+the\s+case/i,
  /^\*?\s*-?\s*Review\s+prior/i,
];

const NOISE_LINE_PATTERNS = [
  /^Answer\s+self-study\s+questions/i,
  /^Review\s+prior\s+to\s+the\s+case\.?\s*$/i,
  /^These\s+objectives\s+are\s+integral\s+for/i,
  /^For\s+this\s+case,\s+focus/i,
  /^Slide\s+\d+\s+of/i,
  /^\*+\s*$/,
  /^-+$/,
  /^\d+\s*$/,
  /^Page\s+\d+/i,
  /^ISBN[:\s]/i,
  /^Authors?:/i,
  /^Publisher:/i,
  /^Additional Information:/i,
  /^Recommended Materials/i,
  /^Prerequisites/i,
  /^Required Materials/i,
  /^EReserves Information/i,
  /^Log in with your/i,
  /^On the main screen/i,
  /^Select "Install/i,
  /^https?:\/\//i,
  /^There are no prerequisites/i,
  /^Attendance and punctuality/i,
  /^Students should attempt/i,
  /^Students should not assume/i,
  /^Requests for any planned absence/i,
  /^Students can expect/i,
  /Illustrated Reviews Series\)/i,
  /available through (Clinical Key|Access Medicine)/i,
  /This book is used in multiple courses/i,
  /development of professional identity as a physician/i,
];

const BULLET_PREFIX = /^\s*(?:[-•▪●o*]|\d+[.)])\s+/;
const EO_CODE_PATTERN = /\((EO-\d{4})\)\s*$/;
const TO_CODE_PATTERN = /\((TO-\d{4})\)/;
const TO_CODE_END_PATTERN = /\(TO-\d{4}\)\s*$/;
const TOPICS_SUBHEADER = /^Self-Study\s+Topics/i;
const MEDIA_REF_PATTERN = /^(?:SLIDES?\s*:|Slides?\s+\d)/i;
const TIMESTAMP_END_PATTERN = /\(\d{1,2}:\d{2}\)\s*$/;
const VERB_START =
  /^(?:Describe|Explain|Identify|Discuss|Define|Compare|Contrast|List|Name|Demonstrate|Apply|Analyze|Evaluate|Recognize|Interpret|Differentiate|Summarize|Outline|Predict|Calculate|Perform|Develop|Formulate|Integrate|Correlate|Review|Understand|Distinguish|Classify|Relate|Assess|Manage|Treat|Diagnose|Order|Counsel|Educate|Communicate|Document|Prioritize|Select|Recommend|Utilize|Employ|Construct|Draw|Label|Locate|Recall|State|Use|Show|Given|Given\s+a|Given\s+the)/i;

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function isObjectiveSectionHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return OBJECTIVE_SECTION_PATTERNS.some((p) => p.test(trimmed));
}

function isSectionEnd(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return SECTION_END_PATTERNS.some((p) => p.test(trimmed));
}

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed.length < 8 && !EO_CODE_PATTERN.test(trimmed)) return true;
  return NOISE_LINE_PATTERNS.some((p) => p.test(trimmed));
}

function isIntroLine(line: string): boolean {
  return INTRO_LINE_PATTERNS.some((p) => p.test(line.trim()));
}

function cleanObjectiveLine(line: string): string {
  let text = line.trim().replace(BULLET_PREFIX, "").trim();
  text = text.replace(/\s+/g, " ");
  return text;
}

function isCompleteObjective(text: string): boolean {
  if (EO_CODE_PATTERN.test(text)) return true;
  const trimmed = text.trim();
  return /[.!?)]$/.test(trimmed);
}

/** Self-study topic titles carry (TO-####) but lack student-action verbs. */
function isStudyTopicLine(line: string): boolean {
  const cleaned = cleanObjectiveLine(line);
  if (!TO_CODE_PATTERN.test(cleaned)) return false;
  if (MEDIA_REF_PATTERN.test(cleaned) || TIMESTAMP_END_PATTERN.test(cleaned)) {
    return true;
  }
  return TO_CODE_END_PATTERN.test(cleaned) && !VERB_START.test(cleaned);
}

function looksLikeObjective(line: string): boolean {
  const cleaned = cleanObjectiveLine(line);
  if (isNoiseLine(cleaned) || isIntroLine(cleaned) || isStudyTopicLine(cleaned)) {
    return false;
  }
  const hasEoCode = EO_CODE_PATTERN.test(cleaned);
  if (cleaned.length > 800 && !hasEoCode) return false;
  if (hasEoCode) return cleaned.length >= 20;
  if (!isCompleteObjective(cleaned)) return false;
  if (VERB_START.test(cleaned)) return cleaned.length >= 15;
  return false;
}

function scoreObjective(text: string): "high" | "medium" | "low" {
  if (text.length > 500 || text.split(/\.\s+/).length > 4) return "low";
  if (text.length < 20) return "low";
  if (VERB_START.test(text) || EO_CODE_PATTERN.test(text)) return "high";
  return "medium";
}

export function findObjectiveSections(text: string): ObjectiveSection[] {
  const lines = text.split(/\r?\n/);
  const sections: ObjectiveSection[] = [];
  let i = 0;

  while (i < lines.length) {
    if (!isObjectiveSectionHeading(lines[i])) {
      i++;
      continue;
    }

    const heading = lines[i].trim();
    const startLine = i;
    i++;

    while (i < lines.length && (isIntroLine(lines[i]) || lines[i].trim() === "")) {
      i++;
    }

    const contentStart = i;
    let sawTopicsHeader = false;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (trimmed && TOPICS_SUBHEADER.test(trimmed)) {
        sawTopicsHeader = true;
      }
      const topicLine = sawTopicsHeader && TO_CODE_END_PATTERN.test(trimmed);
      if (
        trimmed &&
        isSectionEnd(trimmed) &&
        !isObjectiveSectionHeading(trimmed) &&
        !topicLine
      ) {
        break;
      }
      if (
        trimmed &&
        isObjectiveSectionHeading(trimmed) &&
        i > contentStart
      ) {
        break;
      }
      i++;
    }

    const excerpt = lines.slice(startLine, i).join("\n").trim();
    if (excerpt.length > heading.length + 5) {
      sections.push({
        heading,
        startLine,
        endLine: i - 1,
        excerpt,
      });
    }
  }

  return sections;
}

function parseObjectiveLines(
  sectionLines: string[],
  sectionHeading: string,
  startLineOffset: number,
  sourceExcerpt: string,
  fullText: string,
): ExtractedObjective[] {
  const objectives: ExtractedObjective[] = [];
  let buffer: string[] = [];
  let bufferStartLine = startLineOffset;

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    const raw = buffer.join(" ").trim();
    const text = cleanObjectiveLine(raw);
    if (!looksLikeObjective(text)) {
      buffer = [];
      return;
    }
    const codeMatch = text.match(EO_CODE_PATTERN);
    const charOffset = charOffsetAtLine(fullText, bufferStartLine);
    objectives.push({
      text: stripPageBreakMarkers(text),
      ordinal: objectives.length + 1,
      sectionHeading,
      sourceLineStart: bufferStartLine,
      sourceExcerpt: stripPageBreakMarkers(sourceExcerpt),
      extractionMethod: "regex",
      confidence: scoreObjective(text),
      eoCode: codeMatch?.[1],
      sourcePage: sourcePageAtCharOffset(fullText, charOffset),
    });
    buffer = [];
  };

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushBuffer();
      continue;
    }

    if (isIntroLine(trimmed) || isNoiseLine(trimmed) || isStudyTopicLine(trimmed)) {
      flushBuffer();
      continue;
    }

    const hasBullet = BULLET_PREFIX.test(trimmed);
    const cleanedLine = cleanObjectiveLine(trimmed);
    const hasEoCode = EO_CODE_PATTERN.test(cleanedLine);
    const isStandaloneObjective =
      looksLikeObjective(trimmed) &&
      (hasBullet || VERB_START.test(cleanedLine) || hasEoCode);

    const bufferText = buffer.join(" ");
    const bufferComplete = EO_CODE_PATTERN.test(bufferText);

    if (hasBullet || isStandaloneObjective) {
      flushBuffer();
      bufferStartLine = startLineOffset + i;
      buffer.push(trimmed);
    } else if (
      buffer.length > 0 &&
      trimmed.length > 0 &&
      !isSectionEnd(trimmed) &&
      !bufferComplete
    ) {
      buffer.push(trimmed);
    } else if (looksLikeObjective(trimmed)) {
      flushBuffer();
      bufferStartLine = startLineOffset + i;
      buffer.push(trimmed);
    }
  }

  flushBuffer();
  return objectives;
}

export function extractObjectivesFromText(text: string): ExtractedObjective[] {
  const sections = findObjectiveSections(text);
  const all: ExtractedObjective[] = [];
  const lines = text.split(/\r?\n/);

  for (const section of sections) {
    const sectionLines = lines.slice(section.startLine + 1, section.endLine + 1);
    const parsed = parseObjectiveLines(
      sectionLines,
      section.heading,
      section.startLine + 1,
      section.excerpt,
      text,
    );
    for (const obj of parsed) {
      all.push({ ...obj, ordinal: all.length + 1 });
    }
  }

  return dedupeObjectives(all);
}

export function dedupeObjectives(
  objectives: ExtractedObjective[],
): ExtractedObjective[] {
  const seen = new Set<string>();
  const result: ExtractedObjective[] = [];

  for (const obj of objectives) {
    const key = normalizeForMatch(obj.text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...obj, ordinal: result.length + 1 });
  }

  return result;
}

function sectionsAreTopicsOnly(fullText: string, sections: ObjectiveSection[]): boolean {
  let sawTopicsHeader = false;
  let substantiveLines = 0;
  const lines = fullText.split(/\r?\n/);
  for (const section of sections) {
    for (let i = section.startLine + 1; i <= section.endLine; i++) {
      const trimmed = lines[i]?.trim() ?? "";
      if (!trimmed || isIntroLine(trimmed) || isNoiseLine(trimmed)) continue;
      if (TOPICS_SUBHEADER.test(trimmed)) {
        sawTopicsHeader = true;
        continue;
      }
      substantiveLines++;
      if (!isStudyTopicLine(trimmed)) return false;
    }
  }
  return sawTopicsHeader && substantiveLines > 0;
}

export function needsLlmCleanup(
  objectives: ExtractedObjective[],
  sections: ObjectiveSection[],
  fullText: string,
): boolean {
  if (sections.length === 0) return false;
  if (objectives.length === 0) {
    return !sectionsAreTopicsOnly(fullText, sections);
  }

  const lowCount = objectives.filter((o) => o.confidence === "low").length;
  if (lowCount > 0 && lowCount >= objectives.length * 0.5) return true;

  const hasRunOn = objectives.some(
    (o) =>
      o.text.length > 400 &&
      o.confidence !== "high" &&
      !o.eoCode,
  );
  if (hasRunOn) return true;

  return false;
}

export function mergeCleanedWithRegex(
  regex: ExtractedObjective[],
  cleaned: ExtractedObjective[],
  reason: "missing" | "messy",
): ExtractedObjective[] {
  const llmItems = cleaned.filter((o) => o.extractionMethod === "llm_cleanup");
  if (llmItems.length === 0) return regex;

  if (reason === "missing") {
    return dedupeObjectives([...regex, ...llmItems]);
  }

  const llmKeys = new Set(llmItems.map((o) => normalizeForMatch(o.text)));
  const keptRegex = regex.filter((o) => {
    if (o.confidence === "high" || o.eoCode) return true;
    if (o.confidence === "low") return false;
    return !llmKeys.has(normalizeForMatch(o.text));
  });
  return dedupeObjectives([...keptRegex, ...llmItems]);
}

export function getSourceExcerptForCleanup(
  sections: ObjectiveSection[],
): string {
  return stripPageBreakMarkers(
    sections.map((s) => s.excerpt).join("\n\n---\n\n"),
  );
}
