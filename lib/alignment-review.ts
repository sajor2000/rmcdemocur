/**
 * Single source of the two faculty-review rules that govern alignments. Pure
 * and unit-testable, so the SQL predicates that mirror them (`NOT_REJECTED` in
 * lib/queries.ts) and the realign preservation guard (scripts/realign.ts) have
 * a documented, tested definition instead of the rule living only inside raw
 * SQL strings.
 *
 * Two DISTINCT rules — do not conflate them:
 *  - Coverage counting excludes ONLY 'rejected' (pending + approved both count).
 *  - Realign preservation skips a chunk that carries ANY reviewed decision
 *    (approved OR rejected), so re-alignment never discards faculty review.
 */

/** Faculty has made a decision on this alignment (approved or rejected). */
export function isReviewedStatus(status: string | null | undefined): boolean {
  return status === "approved" || status === "rejected";
}

/** A chunk carries a faculty decision → realign must skip it (scripts/realign.ts). */
export function hasReviewedAlignment(
  statuses: (string | null | undefined)[],
): boolean {
  return statuses.some(isReviewedStatus);
}

/**
 * Does this alignment count toward coverage? Everything except an explicit
 * rejection counts — pending, approved, and NULL (legacy) all count. This is
 * the pure mirror of the SQL `a.status IS DISTINCT FROM 'rejected'` predicate
 * (lib/queries.ts NOT_REJECTED). Coverage itself is computed in SQL against the
 * live DB, so this documents and tests the RULE; the SQL is verified by the
 * live smoke check, not by Vitest.
 */
export function countsTowardCoverage(status: string | null | undefined): boolean {
  return status !== "rejected";
}
