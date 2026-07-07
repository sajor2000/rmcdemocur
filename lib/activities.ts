/**
 * Activity-level mapping dimension (Brett's "map activities" idea), derived
 * entirely from data already ingested — no re-processing, no schema change.
 *
 * Faculty guides are structured into numbered activities ("Activity 1:",
 * "Activity 2A:", …), which the chunker already captures as `chunks.section`
 * (see lib/chunker.ts, which opens a new section only on a heading with a
 * trailing colon: /^Activity\s+\d+[A-Z]?:.*$/). Rolling alignments up by a
 * normalized activity key lets us report coverage per activity, reusing the
 * canonical intensity engine (lib/coverage.ts). Deterministic and pure —
 * zero DB/LLM dependence here (queries live in lib/queries.ts).
 */

/** The bucket for chunks whose section is not an "Activity N" heading. */
export const UNASSIGNED_ACTIVITY = "Unassigned";

/**
 * Normalize a chunk section to a stable activity key, or null when the section
 * is not an activity heading (caller buckets null under UNASSIGNED_ACTIVITY).
 *
 * "Activity 3: Metabolism of fats" -> "Activity 3"
 * "activity 2a — intro"            -> "Activity 2A"  (letter suffix preserved, uppercased)
 * "Learning Objectives"            -> null
 */
export function activityKeyOf(section: string | null | undefined): string | null {
  if (!section) return null;
  const match = section.trim().match(/^Activity\s+(\d+)([A-Za-z]?)/i);
  if (!match) return null;
  const number = match[1];
  const letter = match[2] ? match[2].toUpperCase() : "";
  return `Activity ${number}${letter}`;
}

export type ActivityAlignmentRow = {
  section: string | null;
  chunkId: number;
  frameworkId: string | null;
};

export type ActivityCoverage = {
  /** Activity key (e.g. "Activity 3") or UNASSIGNED_ACTIVITY. */
  activity: string;
  /** Distinct chunks assigned to this activity. */
  chunks: number;
  /** Distinct framework topics (framework_id) this activity touches. */
  topics: number;
};

/**
 * Roll per-chunk alignment rows up to per-activity coverage. Pure and
 * exported for testing. Chunks whose section is not an activity heading fall
 * into a single UNASSIGNED_ACTIVITY bucket rather than vanishing, so the view
 * can render an explicit "not organized into activities" state instead of a
 * mystery row. Sorted with real activities first (numeric-aware), Unassigned
 * last.
 */
export function rollupActivities(rows: ActivityAlignmentRow[]): ActivityCoverage[] {
  const byActivity = new Map<string, { chunks: Set<number>; topics: Set<string> }>();
  for (const row of rows) {
    const key = activityKeyOf(row.section) ?? UNASSIGNED_ACTIVITY;
    const entry = byActivity.get(key) ?? { chunks: new Set<number>(), topics: new Set<string>() };
    entry.chunks.add(row.chunkId);
    if (row.frameworkId) entry.topics.add(row.frameworkId);
    byActivity.set(key, entry);
  }
  return Array.from(byActivity.entries())
    .map(([activity, e]) => ({ activity, chunks: e.chunks.size, topics: e.topics.size }))
    .sort((a, b) => {
      if (a.activity === UNASSIGNED_ACTIVITY) return 1;
      if (b.activity === UNASSIGNED_ACTIVITY) return -1;
      return a.activity.localeCompare(b.activity, undefined, { numeric: true });
    });
}

/** True when a case resolved to only the Unassigned bucket — i.e. its guides
 * are not organized into activities, so the view should show an explicit note
 * rather than a lone unlabeled row. */
export function isActivityless(coverage: ActivityCoverage[]): boolean {
  return coverage.length === 0 || (coverage.length === 1 && coverage[0].activity === UNASSIGNED_ACTIVITY);
}
