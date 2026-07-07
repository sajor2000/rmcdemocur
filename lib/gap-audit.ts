/**
 * Deterministic false-negative *triage* for coverage gaps (KTD2). A "gap" node
 * (0 documents addressing it) may be a genuine gap OR a detection miss — the
 * alignment engine never produced a row for content that is actually present.
 * This module flags *candidate* misses by checking whether a gap node's
 * distinctive keywords appear in any in-scope chunk.
 *
 * IMPORTANT: lexical presence is a WEAK proxy. Generic tokens ("cyst",
 * "obstruction", "pain") over-match unrelated chunks, and genuine semantic
 * coverage without lexical overlap is missed. The output is a review QUEUE for
 * human/LLM confirmation, never a verdict that a node is covered. Pure, no
 * DB/LLM dependence — the DB runner is scripts/audit-gap-detection.ts.
 */

/** Generic clinical/list tokens that carry little discriminating signal — a
 * match on these alone should not flag a node, so they are dropped from a
 * node's keyword set. */
const GENERIC_TOKENS = new Set([
  "disorder", "disorders", "disease", "diseases", "acute", "chronic",
  "benign", "malignant", "congenital", "hereditary", "primary", "secondary",
  "cyst", "cysts", "tumor", "tumors", "neoplasm", "neoplasms", "syndrome",
  "obstruction", "insufficiency", "deficiency", "pain", "including", "other",
  "associated", "related", "eg", "ie", "type", "failure", "injury",
]);

/** Words too short or numeric to be discriminating. Known limitation: the
 * length>=5 cutoff (and the digit-stripping split in nodeKeywords) drops short
 * medical identifiers like "MEN1"/"MEN2", "gout", "HIV" — acceptable for a
 * weak-proxy triage tool (KTD2), but it narrows recall on short vocabulary. A
 * short-term allowlist could be added if such nodes need to surface. */
function isUsefulToken(token: string): boolean {
  return token.length >= 5 && !GENERIC_TOKENS.has(token) && !/^\d+$/.test(token);
}

/**
 * Extract distinctive keywords for a framework node from its subdomain label
 * and fullText. Splits on punctuation/whitespace, lowercases, drops generic
 * and short tokens, dedupes. Exported for testing.
 */
export function nodeKeywords(node: { subdomain?: string | null; fullText?: string | null }): string[] {
  const source = `${node.subdomain ?? ""} ${node.fullText ?? ""}`.toLowerCase();
  const tokens = source
    .split(/[^a-z]+/)
    .filter(isUsefulToken);
  return Array.from(new Set(tokens));
}

/**
 * Which of a node's keywords appear as whole words in a chunk's content.
 * Returns the matched keywords (empty = no lexical signal). Exported for
 * testing.
 */
export function matchedKeywords(keywords: string[], chunkContent: string): string[] {
  const content = chunkContent.toLowerCase();
  return keywords.filter((kw) => {
    // Whole-word match to avoid "pancreas" matching inside unrelated tokens.
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    return re.test(content);
  });
}

export type GapCandidate = {
  stableId: string;
  system: string;
  topic: string;
  /** Distinct node keywords found in some in-scope chunk. */
  hits: string[];
  /** A representative chunk + excerpt where the strongest match occurred. */
  chunkId: number;
  documentId: number | null;
  excerpt: string;
};

/**
 * Rank gap nodes by how strongly their keywords appear in in-scope chunk
 * content — the triage list. A node with more distinct keyword hits ranks
 * higher (more likely a real detection miss worth re-aligning). Pure: takes
 * already-fetched gap nodes and chunks, returns the ranked candidates. Nodes
 * with zero keyword hits are omitted (no lexical signal to act on).
 */
export function rankGapCandidates(
  gapNodes: { stableId: string; system: string; topic: string; subdomain?: string | null; fullText?: string | null }[],
  chunks: { id: number; documentId: number | null; content: string }[],
): GapCandidate[] {
  const candidates: GapCandidate[] = [];
  for (const node of gapNodes) {
    const keywords = nodeKeywords(node);
    if (keywords.length === 0) continue;
    let best: { hits: string[]; chunk: { id: number; documentId: number | null; content: string } } | null = null;
    const allHits = new Set<string>();
    for (const chunk of chunks) {
      const hits = matchedKeywords(keywords, chunk.content);
      if (hits.length === 0) continue;
      hits.forEach((h) => allHits.add(h));
      if (!best || hits.length > best.hits.length) best = { hits, chunk };
    }
    if (!best) continue;
    candidates.push({
      stableId: node.stableId,
      system: node.system,
      topic: node.topic,
      hits: Array.from(allHits).sort(),
      chunkId: best.chunk.id,
      documentId: best.chunk.documentId,
      excerpt: excerptAround(best.chunk.content, best.hits[0]),
    });
  }
  return candidates.sort((a, b) => b.hits.length - a.hits.length);
}

/** A short excerpt of chunk content around the first matched keyword. */
function excerptAround(content: string, keyword: string, radius = 60): string {
  // Locate the same whole-word boundary matchedKeywords used, so the excerpt is
  // centered on the real hit, not a substring inside a longer word (e.g.
  // "renal" inside "adrenal").
  const re = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  const idx = re.exec(content)?.index ?? -1;
  if (idx < 0) return content.slice(0, radius * 2).trim();
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + keyword.length + radius);
  return `${start > 0 ? "…" : ""}${content.slice(start, end).trim()}${end < content.length ? "…" : ""}`;
}
