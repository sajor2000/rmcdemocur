import type { AlignmentResult } from "@/lib/alignment-prompts";

export type FrameworkCandidate = {
  stableId: string;
  label: string;
  description: string;
};

export function buildAlignmentSystemPrompt(
  framework: "AAMC" | "USMLE",
  candidates: FrameworkCandidate[],
): string {
  const role =
    framework === "AAMC"
      ? "AAMC PCRS / Core EPA curriculum expert"
      : "USMLE 2025 Content Outline expert";

  const candidateBlock = candidates
    .map(
      (c) =>
        `- ${c.stableId}: ${c.label}${c.description ? ` — ${c.description.slice(0, 200)}` : ""}`,
    )
    .join("\n");

  const idField = framework === "USMLE" ? "domain" : "framework_id";

  return `You are a medical education ${role}.

Given a faculty guide text chunk, identify which framework items from the AUTHORITATIVE LIST below are addressed.

AUTHORITATIVE LIST (you may ONLY return IDs from this list):
${candidateBlock}

Return ONLY valid JSON:
{
  "alignments": [
    {
      "${idField}": "<stableId from list>",
      "framework_label": "<label from list>",
      "confidence": 0.85,
      "rationale": "Brief evidence from the chunk."
    }
  ]
}

For USMLE, put the stableId in the "domain" field. For AAMC, use "framework_id".
Only include alignments with confidence >= 0.60. Return empty array if none apply.
Never invent IDs not in the list.`;
}

export function validateAlignments(
  results: AlignmentResult[],
  allowedIds: Set<string>,
  framework: "AAMC" | "USMLE",
): AlignmentResult[] {
  return results.filter((r) => {
    const id =
      framework === "USMLE"
        ? (r.domain ?? r.framework_id)
        : (r.framework_id ?? r.domain);
    if (!id || !allowedIds.has(id)) return false;
    return r.confidence >= 0.6;
  });
}

export function normalizeAlignmentIds(
  results: AlignmentResult[],
  framework: "AAMC" | "USMLE",
): AlignmentResult[] {
  return results.map((r) => {
    if (framework === "USMLE" && r.domain && !r.framework_id) {
      return { ...r, framework_id: r.domain };
    }
    if (framework === "AAMC" && r.framework_id && !r.domain) {
      return r;
    }
    return r;
  });
}
