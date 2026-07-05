import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProgramSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

// NOTE: minimal first-pass program view. The plan
// (docs/plans/2026-07-05-002-feat-intensity-coverage-model-plan.md) enriches
// this with the shared CoverageSpectrum/MethodExplainer components, a scope
// selector (Entire / M1 / …), per-system table, and full R6 in-place
// explanations. This version already uses the intensity model + both metrics.

const LEVELS: { key: "introduced" | "reinforced" | "strong" | "heavy"; label: string; docs: string; color: string; tip: string }[] = [
  { key: "introduced", label: "Introduced", docs: "1 doc", color: "bg-amber-200", tip: "Addressed in a single course document (session) — introduced once." },
  { key: "reinforced", label: "Reinforced", docs: "2–3 docs", color: "bg-partial-yellow", tip: "Addressed across 2–3 documents — reinforced." },
  { key: "strong", label: "Strong", docs: "4–7 docs", color: "bg-green-300", tip: "Addressed across 4–7 documents — well reinforced." },
  { key: "heavy", label: "Heavily covered", docs: "8+ docs", color: "bg-covered-green", tip: "Addressed in 8+ documents — heavily covered (a redundancy candidate across courses)." },
];

function Spectrum({
  title,
  dist,
}: {
  title: string;
  dist: { total: number; addressed: number; gaps: number; introduced: number; reinforced: number; strong: number; heavy: number };
}) {
  const seg = (n: number) => (n / dist.total) * 100;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-rush-medium">
          <strong className="text-rush-dark">{dist.addressed}</strong> of {dist.total} topics
          addressed · <strong className="text-rush-dark">{dist.gaps}</strong> gaps
        </p>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-gap-red" title={`${dist.gaps} not addressed (gap)`}>
          {LEVELS.map((l) => (
            <div
              key={l.key}
              className={l.color}
              style={{ width: `${seg(dist[l.key])}%` }}
              title={`${l.label} (${l.docs}): ${dist[l.key]} topics — ${l.tip}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-rush-medium">
          <span className="flex items-center gap-1" title="No curriculum document addresses this topic.">
            <span className="h-3 w-3 rounded-sm bg-gap-red" /> Gap {dist.gaps}
          </span>
          {LEVELS.map((l) => (
            <span key={l.key} className="flex items-center gap-1" title={`${l.docs}: ${l.tip}`}>
              <span className={`h-3 w-3 rounded-sm ${l.color}`} /> {l.label} {dist[l.key]}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function ProgramPage() {
  const program = await getProgramSummary().catch(() => null);
  if (!program || program.metrics.courses === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="font-heading text-2xl font-bold">Program Curriculum Coverage</h1>
        <p className="mt-2 text-rush-medium">No courses processed yet.</p>
      </div>
    );
  }

  const { metrics, usmle, aamc, mostCovered } = program;
  const scope = "Entire curriculum";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Program Curriculum Coverage</h1>
        <p className="mt-1 text-rush-medium">
          All {metrics.courses} course{metrics.courses === 1 ? "" : "s"} ({metrics.documents}{" "}
          documents), measured against the full USMLE and AAMC framework. Course{" "}
          <Link href="/courses/1" className="text-rush-green hover:underline">
            pages
          </Link>{" "}
          are scoped to their own organ systems; this program view is not.
        </p>
      </div>

      {/* R6: how coverage is measured — plain language for non-AI educators. */}
      <div className="rounded-lg border border-rush-green/30 bg-green-50/50 p-4 text-sm text-rush-dark">
        <p className="font-medium">How coverage is measured</p>
        <p className="mt-1 text-rush-medium">
          RushMap uses AI to align each passage of curriculum content to USMLE and AAMC topics. A
          topic&apos;s coverage level is the number of distinct course documents (sessions) that
          address it: <em>Introduced</em> (1), <em>Reinforced</em> (2–3), <em>Strong</em> (4–7),
          <em> Heavily covered</em> (8+); topics no document addresses are <em>gaps</em>. These are
          AI-generated alignments intended to support faculty review, not replace it.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Spectrum title="USMLE coverage" dist={usmle.byScope[scope]} />
        <Spectrum title="AAMC coverage" dist={aamc.byScope[scope]} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Most-addressed topics (redundancy candidates)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {mostCovered.map((m) => (
              <li key={m.label} className="flex items-center justify-between gap-4">
                <span className="truncate">{m.label}</span>
                <span
                  className="shrink-0 text-rush-medium"
                  title={`Addressed in ${m.docs} documents across ${m.courses} course(s).`}
                >
                  {m.docs} docs
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
