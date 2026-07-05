import { LEVELS, type CoverageDist } from "@/lib/coverage";

/**
 * The coverage intensity spectrum — a stacked bar (gap -> heavy) plus a legend,
 * every segment/entry carrying its plain-language tooltip. Presents BOTH metrics
 * (addressed + the spectrum). All labels/colors/tooltips come from lib/coverage,
 * so program / course / gap surfaces stay identical (R2, R6, R7).
 */
export function CoverageSpectrum({ dist }: { dist: CoverageDist }) {
  const pct = (n: number) => (dist.total > 0 ? (n / dist.total) * 100 : 0);
  return (
    <div className="space-y-2">
      <p className="text-sm text-rush-medium">
        <strong className="text-rush-dark">{dist.addressed}</strong> of {dist.total} addressed
        {" · "}
        <strong className="text-rush-dark">{dist.substantive}</strong> reinforced+
        {" · "}
        <strong className="text-rush-dark">{dist.gap}</strong> gaps
      </p>
      <div className="flex h-4 w-full overflow-hidden rounded-full">
        {LEVELS.map((l) => (
          <div
            key={l.key}
            className={l.colorClass}
            style={{ width: `${pct(dist[l.key])}%` }}
            title={`${l.label} (${l.docRange}): ${dist[l.key]} topics — ${l.tooltip}`}
          />
        ))}
      </div>
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
