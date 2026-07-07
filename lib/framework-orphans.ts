/**
 * Detect alignments whose framework_id no longer matches any framework node —
 * the "orphan" state a taxonomy re-seed can create. `alignments.framework_id`
 * is a loose string join to `usmle_domains.stable_id` (no FK), so when a
 * re-parse changes/removes a stableId, old alignment rows silently stop
 * matching any node and drop out of coverage. Pure and unit-testable; the DB
 * runner is scripts/audit-framework-orphans.ts.
 */

export type AlignmentRef = {
  frameworkId: string;
  status: string | null;
  chunkId: number;
};

/** A faculty decision (approved/rejected) — realign skips these chunks, so
 * their alignments keep the old framework_id and would orphan silently. */
export function isReviewedStatus(status: string | null | undefined): boolean {
  return status === "approved" || status === "rejected";
}

export type OrphanPartition = {
  /** Orphans on unreviewed chunks — a review-preserving realign will rewrite
   * these, so they are expected to be zero after the migration. */
  unreviewed: AlignmentRef[];
  /** Orphans on faculty-reviewed chunks — realign skips these, so each needs a
   * concrete remediation (re-align that chunk against the new taxonomy and
   * re-present for re-approval). Surfacing is not fixing. */
  reviewed: AlignmentRef[];
};

/**
 * Partition the alignment refs whose framework_id is absent from the current
 * taxonomy into reviewed vs unreviewed orphans. Pure; exported for testing.
 */
export function partitionOrphans(
  alignments: AlignmentRef[],
  validStableIds: Set<string>,
): OrphanPartition {
  const orphans = alignments.filter(
    (a) => a.frameworkId && !validStableIds.has(a.frameworkId),
  );
  return {
    unreviewed: orphans.filter((a) => !isReviewedStatus(a.status)),
    reviewed: orphans.filter((a) => isReviewedStatus(a.status)),
  };
}

/** Aggregate orphan refs by framework_id for a compact report, most-frequent
 * first. Pure; exported for testing. */
export function summarizeOrphans(
  refs: AlignmentRef[],
): { frameworkId: string; count: number }[] {
  const byId = new Map<string, number>();
  for (const r of refs) byId.set(r.frameworkId, (byId.get(r.frameworkId) ?? 0) + 1);
  return Array.from(byId.entries())
    .map(([frameworkId, count]) => ({ frameworkId, count }))
    .sort((a, b) => b.count - a.count);
}
