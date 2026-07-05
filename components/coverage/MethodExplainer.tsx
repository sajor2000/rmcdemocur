import { LEVELS, METHOD_NOTE } from "@/lib/coverage";

/**
 * "How coverage is measured" — the persistent, plain-language method box shown on
 * every coverage surface so non-AI educators understand the logic behind every
 * number (R6). States the AI-assisted / faculty-review-required basis and defines
 * each level. Content comes from lib/coverage (single source).
 */
export function MethodExplainer() {
  return (
    <div className="rounded-lg border border-rush-green/30 bg-green-50/50 p-4 text-sm">
      <p className="font-medium text-rush-dark">How coverage is measured</p>
      <p className="mt-1 text-rush-medium">{METHOD_NOTE}</p>
      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
        {LEVELS.map((l) => (
          <li key={l.key} className="flex items-start gap-2 text-xs text-rush-medium">
            <span className={`mt-0.5 h-3 w-3 shrink-0 rounded-sm ${l.colorClass}`} />
            <span>
              <strong className="text-rush-dark">{l.label}</strong> ({l.docRange}) — {l.tooltip}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
