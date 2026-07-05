/**
 * Canonical curriculum-coverage model — the SINGLE source of level definitions,
 * thresholds, labels, and the distribution computation. Every surface (program
 * view, course dashboard, gap analysis, exports) imports from here; no inline
 * redefinitions anywhere (R7 consistency gate).
 *
 * Coverage is INTENSITY, not binary (Introduced -> Reinforced -> Mastered). A
 * framework topic's level is the number of DISTINCT documents (sessions) that
 * address it. Deterministic: this module has zero DB/LLM dependence.
 */

export type LevelKey = "gap" | "introduced" | "reinforced" | "strong" | "heavy";

export type Level = {
  key: LevelKey;
  label: string;
  docRange: string; // human-readable, e.g. "2-3 docs"
  tooltip: string; // plain-language, for non-AI educators
  colorClass: string; // tailwind bg-*
};

/** Ordered levels (gap first) with educator-facing labels + tooltips + colors. */
export const LEVELS: Level[] = [
  {
    key: "gap",
    label: "Not addressed",
    docRange: "0 docs",
    colorClass: "bg-gap-red",
    tooltip: "No curriculum document addresses this topic — a coverage gap.",
  },
  {
    key: "introduced",
    label: "Introduced",
    docRange: "1 doc",
    colorClass: "bg-amber-200",
    tooltip:
      "Addressed in a single course document (session) — introduced once, not yet reinforced.",
  },
  {
    key: "reinforced",
    label: "Reinforced",
    docRange: "2-3 docs",
    colorClass: "bg-partial-yellow",
    tooltip: "Addressed across 2-3 documents — reinforced.",
  },
  {
    key: "strong",
    label: "Strong",
    docRange: "4-7 docs",
    colorClass: "bg-green-300",
    tooltip: "Addressed across 4-7 documents — well reinforced.",
  },
  {
    key: "heavy",
    label: "Heavily covered",
    docRange: "8+ docs",
    colorClass: "bg-covered-green",
    tooltip:
      "Addressed in 8+ documents — heavily covered; a redundancy candidate when spread across courses.",
  },
];

/**
 * Level thresholds (distinct documents), tunable in one place. 0 -> gap,
 * 1 -> introduced, 2-3 -> reinforced, 4-7 -> strong, 8+ -> heavy.
 */
export function levelOf(docs: number): LevelKey {
  if (docs <= 0) return "gap";
  if (docs >= 8) return "heavy";
  if (docs >= 4) return "strong";
  if (docs >= 2) return "reinforced";
  return "introduced";
}

const LEVEL_BY_KEY = Object.fromEntries(LEVELS.map((l) => [l.key, l])) as Record<LevelKey, Level>;

/** The human level label for a document count (e.g. 5 -> "Strong"). */
export function levelLabel(docs: number): string {
  return LEVEL_BY_KEY[levelOf(docs)].label;
}

export type CoverageDist = {
  total: number;
  addressed: number; // >= 1 document (broad "addressed" metric)
  substantive: number; // >= 2 documents (reinforced+)
  gap: number;
  introduced: number;
  reinforced: number;
  strong: number;
  heavy: number;
};

/**
 * Build a distribution from the per-topic distinct-document counts of the
 * ADDRESSED topics plus the framework total. Gaps = total - addressed.
 */
export function distribution(docCounts: number[], total: number): CoverageDist {
  const d: CoverageDist = {
    total,
    addressed: 0,
    substantive: 0,
    gap: 0,
    introduced: 0,
    reinforced: 0,
    strong: 0,
    heavy: 0,
  };
  for (const n of docCounts) {
    const k = levelOf(n);
    if (k === "gap") continue;
    d[k]++;
    d.addressed++;
    if (n >= 2) d.substantive++;
  }
  d.gap = Math.max(0, total - d.addressed);
  return d;
}

/**
 * Per-session (case) x system heatmap cell status. This answers a different
 * question than `distribution()` above: not "how many documents across the
 * course address topic X" (course-wide depth), but "how much of system Y did
 * THIS session's document touch" (per-document breadth). Cutoffs are
 * independently derived from system coverage breadth — not tuned to produce
 * a particular visual result — so the rule stays falsifiable on its own terms.
 */
export function heatmapCellStatus(
  domainsTouched: number,
  domainsTotal: number,
): "covered" | "partial" | "gap" {
  if (domainsTotal <= 0 || domainsTouched <= 0) return "gap";
  return domainsTouched / domainsTotal >= 0.5 ? "covered" : "partial";
}

/**
 * Deterministic takeaway sentence for a coverage spectrum (R11) — the "so
 * what" a reader gets before the bar/legend, computed only from values
 * already rendered elsewhere on the page (KTD4). Never LLM-generated (R15).
 */
export function spectrumTakeaway(dist: CoverageDist): string {
  if (dist.total <= 0) return "No framework domains to report yet.";
  if (dist.addressed === 0) return `0 of ${dist.total} domains addressed — no documents aligned yet.`;
  if (dist.gap === 0) return `All ${dist.total} domains addressed.`;
  return `${dist.addressed} of ${dist.total} domains addressed; ${dist.gap} need attention.`;
}

/** Deterministic takeaway naming the lowest-coverage AAMC domain (R11, KTD4). */
export function aamcTakeaway(data: { domain: string; percent: number }[]): string {
  if (data.length === 0) return "No AAMC domain data yet.";
  const lowest = data.reduce((min, d) => (d.percent < min.percent ? d : min), data[0]);
  return `${lowest.domain} has the lowest coverage at ${lowest.percent}%.`;
}

/** Deterministic takeaway naming how many session x system heatmap cells are
 * gaps (R11, KTD4). `data` is every returned (case, system) row — an absent
 * pair is implicitly a gap too, and a returned row can itself carry an
 * explicit "gap" status (e.g. a catalog join miss), so gap cells are counted
 * by status, not inferred from array length alone. */
export function heatmapTakeaway(
  cases: number[],
  systems: string[],
  data: { status: string }[],
): string {
  const totalCells = cases.length * systems.length;
  if (totalCells === 0) return "No sessions or systems to show yet.";
  const nonGapCells = data.filter((d) => d.status !== "gap").length;
  const gapCells = Math.max(0, totalCells - nonGapCells);
  if (gapCells === 0) return "Every session touches every in-scope system.";
  return `${gapCells} of ${totalCells} session × system cells show no coverage yet.`;
}

/**
 * The one-line method statement shown to educators wherever coverage appears
 * (R6) and embedded in exported files (R11). States the AI-assisted, faculty-
 * review-required nature and the document-count basis.
 */
export const METHOD_NOTE =
  "Coverage is AI-assisted: curriculum passages are aligned to framework topics, then a topic's level is the number of distinct course documents that address it (Introduced 1, Reinforced 2-3, Strong 4-7, Heavily covered 8+; none = gap). AI alignments support, and require, faculty review.";
