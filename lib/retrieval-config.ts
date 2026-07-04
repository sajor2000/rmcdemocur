/**
 * Relevance thresholds for retrieval (U5). All thresholds default to OFF
 * (null), so unset environments preserve the pre-threshold behavior exactly.
 * Real values are calibrated from dumped distance distributions after the
 * Azure-gated re-embed (see docs/plans/2026-07-03-007 U5).
 */

function parseFloatEnv(
  raw: string | undefined,
  { min, max }: { min: number; max: number },
): number | null {
  if (!raw) return null;
  const parsed = Number.parseFloat(raw.trim());
  if (Number.isNaN(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

/** Max cosine distance for framework/keyword candidates. `null` = no filtering. */
export function resolveMaxDistance(): number | null {
  return parseFloatEnv(process.env.RETRIEVAL_MAX_DISTANCE, { min: 0, max: 2 });
}

/** Min cosine similarity for search results. `null` = no filtering. */
export function resolveMinSimilarity(): number | null {
  return parseFloatEnv(process.env.SEARCH_MIN_SIMILARITY, { min: 0, max: 1 });
}

/** A candidate passes when filtering is off, or its distance is within the floor. */
export function passesDistance(distance: number, maxDistance: number | null): boolean {
  return maxDistance === null || distance <= maxDistance;
}

/** A result passes when filtering is off, or its similarity clears the floor. */
export function passesSimilarity(similarity: number, minSimilarity: number | null): boolean {
  return minSimilarity === null || similarity >= minSimilarity;
}
