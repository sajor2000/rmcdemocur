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
 * The one-line method statement shown to educators wherever coverage appears
 * (R6) and embedded in exported files (R11). States the AI-assisted, faculty-
 * review-required nature and the document-count basis.
 */
export const METHOD_NOTE =
  "Coverage is AI-assisted: curriculum passages are aligned to framework topics, then a topic's level is the number of distinct course documents that address it (Introduced 1, Reinforced 2-3, Strong 4-7, Heavily covered 8+; none = gap). AI alignments support, and require, faculty review.";
