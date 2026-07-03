import { getAzureClient } from "@/lib/azure-ai";
import type { ExtractedObjective } from "@/lib/objective-extractor";
import {
  extractObjectivesFromText,
  findObjectiveSections,
  getSourceExcerptForCleanup,
  mergeCleanedWithRegex,
  needsLlmCleanup,
} from "@/lib/objective-extractor";

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Every cleaned objective must be provably sourced — no paraphrase or invention. */
export function validateCleanedObjectives(
  candidates: string[],
  sourceExcerpt: string,
): string[] {
  const normalizedSource = normalizeForMatch(sourceExcerpt);

  return candidates.filter((text) => {
    const normalized = normalizeForMatch(text);
    if (normalized.length < 12) return false;
    return normalizedSource.includes(normalized);
  });
}

export async function cleanupObjectivesWithLlm(options: {
  sourceExcerpt: string;
  regexCandidates: ExtractedObjective[];
  reason: "missing" | "messy";
}): Promise<ExtractedObjective[]> {
  const { sourceExcerpt, regexCandidates, reason } = options;

  if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_API_KEY) {
    return regexCandidates;
  }

  const chatDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_CHAT;
  if (!chatDeployment) return regexCandidates;

  const client = getAzureClient(chatDeployment);

  const candidateBlock =
    regexCandidates.length > 0
      ? `\nRegex candidates (may be incomplete or merged — split only if clearly separate in source):\n${regexCandidates.map((o, i) => `${i + 1}. ${o.text}`).join("\n")}`
      : "";

  const response = await client.chat.completions.create({
    model: chatDeployment,
    messages: [
      {
        role: "system",
        content: `You extract learning objectives from medical curriculum documents.

STRICT RULES:
- Return ONLY objectives that appear verbatim or as clear contiguous substrings in the source excerpt.
- Do NOT paraphrase, rewrite, merge, summarize, or invent objectives.
- Do NOT add objectives that are not in the source text.
- Split run-on lines ONLY when the source clearly contains separate objectives.
- Ignore intro lines like "At the end of this section..." and "Answer self-study questions."
- Return JSON: { "objectives": ["exact objective text", ...] }
- If no valid objectives can be sourced, return { "objectives": [] }`,
      },
      {
        role: "user",
        content: `Reason for cleanup: ${reason}

Source excerpt:
${sourceExcerpt}
${candidateBlock}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 2000,
  });

  const content = response.choices[0].message.content;
  if (!content) return regexCandidates;

  let parsed: { objectives?: string[] };
  try {
    parsed = JSON.parse(content) as { objectives?: string[] };
  } catch {
    return regexCandidates;
  }

  const validated = validateCleanedObjectives(
    parsed.objectives ?? [],
    sourceExcerpt,
  );

  if (validated.length === 0) {
    return regexCandidates;
  }

  return validated.map((text, i) => {
    const eoMatch = text.match(/\((EO-\d{4})\)\s*$/);
    const prior = regexCandidates.find(
      (o) => normalizeForMatch(o.text) === normalizeForMatch(text),
    );
    return {
      text,
      ordinal: i + 1,
      sectionHeading: prior?.sectionHeading ?? regexCandidates[0]?.sectionHeading ?? "Learning Objectives",
      sourceLineStart: prior?.sourceLineStart ?? 0,
      sourceExcerpt: prior?.sourceExcerpt ?? sourceExcerpt.slice(0, 2000),
      extractionMethod: "llm_cleanup" as const,
      confidence: "high" as const,
      eoCode: eoMatch?.[1] ?? prior?.eoCode,
    };
  });
}

export async function extractAndCleanObjectives(text: string): Promise<{
  objectives: ExtractedObjective[];
  sectionsFound: number;
  llmUsed: boolean;
}> {
  const sections = findObjectiveSections(text);
  let objectives = extractObjectivesFromText(text);
  let llmUsed = false;

  if (needsLlmCleanup(objectives, sections)) {
    try {
      const sourceExcerpt = getSourceExcerptForCleanup(sections);
      const reason = objectives.length === 0 ? "missing" : "messy";
      const regexSnapshot = objectives;
      const cleaned = await cleanupObjectivesWithLlm({
        sourceExcerpt,
        regexCandidates: regexSnapshot,
        reason,
      });
      const llmCleaned = cleaned.some((o) => o.extractionMethod === "llm_cleanup");
      if (llmCleaned) {
        objectives = mergeCleanedWithRegex(regexSnapshot, cleaned, reason);
        llmUsed = true;
      }
    } catch {
      // Fail closed: keep regex results
    }
  }

  return {
    objectives,
    sectionsFound: sections.length,
    llmUsed,
  };
}
