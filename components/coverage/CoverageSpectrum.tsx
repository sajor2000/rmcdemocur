import { LEVELS, spectrumTakeaway, type CoverageDist } from "@/lib/coverage";

/**
 * The stacked intensity bar (gap -> heavy), every segment carrying its plain-
 * language tooltip. Shared by the full CoverageSpectrum and the program per-system
 * table so the bar is defined once (R7). `className` sizes it.
 */
export function IntensityBar({
  dist,
  className = "h-4 w-full rounded-full",
}: {
  dist: CoverageDist;
  className?: string;
}) {
  const pct = (n: number) => (dist.total > 0 ? (n / dist.total) * 100 : 0);
  return (
    <div className={`flex overflow-hidden ${className}`}>
      {LEVELS.map((l) => (
        <div
          key={l.key}
          className={l.colorClass}
          style={{ width: `${pct(dist[l.key])}%` }}
          title={`${l.label} (${l.docRange}): ${dist[l.key]} topics — ${l.tooltip}`}
        />
      ))}
    </div>
  );
}

/**
 * The coverage intensity spectrum — the stacked bar plus a legend. Presents BOTH
 * metrics (addressed + the spectrum). All labels/colors/tooltips come from
 * lib/coverage, so program / course / gap surfaces stay identical (R2, R6, R7).
 */
export function CoverageSpectrum({ dist }: { dist: CoverageDist }) {
  return (
    <div className="space-y-2">
      {/* The takeaway leads — the reader gets the "so what" before the bar
          (R11), a deterministic sentence over the same numbers below it. */}
      <p className="font-takeaway text-base italic text-rush-dark">{spectrumTakeaway(dist)}</p>
      <p className="text-sm tabular-nums text-rush-medium">
        <strong className="text-rush-dark">{dist.addressed}</strong> of {dist.total} addressed
        {" · "}
        <strong className="text-rush-dark">{dist.substantive}</strong> reinforced+
        {" · "}
        <strong className="text-rush-dark">{dist.gap}</strong> gaps
      </p>
      <IntensityBar dist={dist} />
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-rush-medium">
        {LEVELS.map((l) => (
          <span key={l.key} className="flex items-center gap-1" title={l.tooltip}>
            <span className={`h-3 w-3 rounded-sm ${l.colorClass}`} />
            {l.label} {dist[l.key]}
          </span>
        ))}
      </div>
    </div>
  );
}
