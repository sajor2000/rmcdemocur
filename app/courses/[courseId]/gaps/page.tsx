import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { suggestedGapAction } from "@/lib/gap-analyzer";
import { getCourseSummary } from "@/lib/queries";
import { levelLabel, levelOf } from "@/lib/coverage";
import { cleanFrameworkLabel } from "@/lib/utils";
import { CoverageIntensityCard } from "@/components/coverage/CoverageIntensityCard";

// Light row tint per canonical level (lib/coverage.ts's LEVELS), not a
// re-derived doc-count threshold — keys must cover every LevelKey.
const ROW_TINT: Record<string, string> = {
  gap: "bg-red-50",
  introduced: "bg-yellow-50",
  reinforced: "bg-yellow-50",
  strong: "bg-green-50",
  heavy: "bg-green-50",
};

export default async function GapsPage({
  params,
}: {
  params: { courseId: string };
}) {
  const courseId = Number(params.courseId);
  const summary = await getCourseSummary(courseId).catch(() => null);

  if (!summary?.course) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <h1 className="font-heading text-2xl font-bold">Gap Analysis</h1>
        <p className="mt-2 text-rush-medium">
          No gap data yet. Seed and process documents to populate coverage gaps.
        </p>
      </div>
    );
  }

  const { topicRows, metrics, targetSystems, usmleSpectrum, aamcSpectrum } = summary;
  // The Coverage Table renders every catalog topic (both frameworks); the gap
  // cards below are scoped to USMLE only so their count matches the headline
  // sentence's metrics.usmleGaps exactly (one number, one methodology — AE2).
  // AAMC gaps remain fully visible, framework-labeled, in the table/CSV below.
  const gaps = topicRows.filter((r) => r.framework === "USMLE" && r.docs < 2);
  const tableRows = topicRows;

  // Cards are for the truly actionable bucket (0 documents) — "Introduced"
  // (1 document) topics are already counted in the intensity spectrum above,
  // remain in the full Coverage Table below, and rendering all ~100+ thin
  // topics as individual cards made the page unusably long, capped here at
  // CARD_LIMIT for the same reason (found in the U11 screenshot audit).
  const notAddressed = gaps.filter((g) => g.docs === 0);
  const introducedCount = gaps.length - notAddressed.length;
  const CARD_LIMIT = 12;
  const shownGaps = notAddressed.slice(0, CARD_LIMIT);
  const hiddenGapCount = notAddressed.length - shownGaps.length;

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <p className="text-lg">
          {summary.course.code} covers{" "}
          <strong>{metrics.aamcCoveragePercent}%</strong> of AAMC PCRS
          competencies and <strong>{metrics.usmleDomainsCovered}</strong> of{" "}
          {metrics.usmleDomainsTotal}{" "}
          {targetSystems ? "in-scope" : ""} USMLE domains.{" "}
          <strong>{metrics.usmleGaps}</strong> gaps require attention.
        </p>
        {targetSystems && (
          <p className="mt-2 text-sm text-rush-medium">
            Scoped to this course&apos;s organ systems:{" "}
            <span className="font-medium text-rush-dark">
              {targetSystems.join(" · ")}
            </span>
            .
          </p>
        )}
      </div>

      {/* Coverage by level — the same intensity vocabulary as the dashboard/program
          view, and the same numbers as the table and CSV below (one engine, KTD3). */}
      <CoverageIntensityCard
        title={`Coverage by level${targetSystems ? " (in-scope)" : ""}`}
        usmleSpectrum={usmleSpectrum}
        aamcSpectrum={aamcSpectrum}
      />

      <div>
        <h2 className="font-heading text-lg font-semibold">Not addressed (USMLE)</h2>
        <p className="text-sm text-rush-medium">
          USMLE topics with no curriculum document addressing them yet — the same{" "}
          {metrics.usmleGaps} counted above. AAMC gaps are shown in the Coverage
          Table below.
          {introducedCount > 0 && (
            <>
              {" "}
              {introducedCount} additional topic{introducedCount === 1 ? "" : "s"} are introduced
              (addressed once, not yet reinforced) — see the Coverage Table below for the full list.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4">
        {shownGaps.map((gap) => {
          const label = cleanFrameworkLabel(gap.topic);
          return (
            <Card
              key={`${gap.framework}-${gap.system}-${label}`}
              className="border-l-4 border-gap-red"
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <CardTitle className="text-base font-semibold">{label}</CardTitle>
                <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                  Not addressed
                </span>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-rush-medium">{suggestedGapAction(label, "gap")}</p>
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/courses/${courseId}/search?q=${encodeURIComponent(label)}`}
                  >
                    Find Related Content
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {hiddenGapCount > 0 && (
        <p className="text-sm text-rush-medium">
          {hiddenGapCount} more not-addressed topic{hiddenGapCount === 1 ? "" : "s"} — see the full
          list in the Coverage Table below or the CSV export.
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Coverage Table</CardTitle>
          <Button asChild size="sm">
            <a href={`/api/courses/${courseId}/export`}>Export Gap Report (CSV)</a>
          </Button>
        </CardHeader>
        <CardContent className="max-h-[32rem] overflow-y-auto">
          {/* Below sm: the 3-column table genuinely overflows the viewport
              (verified: 401px table in a 292px container) — a stacked list
              instead, no horizontal scroll needed (found in the U11
              screenshot audit). */}
          <ul className="space-y-2 sm:hidden">
            {tableRows.map((row, i) => {
              const rowClass = ROW_TINT[levelOf(row.docs)];
              return (
                <li key={i} className={`rounded-md border-b p-2 text-sm ${rowClass}`}>
                  <p>{cleanFrameworkLabel(row.topic)}</p>
                  <p className="mt-1 text-xs text-rush-medium">
                    {row.docs === 0 ? "Not addressed" : levelLabel(row.docs)} · {row.docs} doc
                    {row.docs === 1 ? "" : "s"}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-left">
                  <th className="pb-2">Topic</th>
                  <th className="pb-2">Level</th>
                  <th className="pb-2">Documents</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => {
                  // Row tint derives from the canonical level (lib/coverage.ts's
                  // levelOf) rather than redefining the doc-count thresholds here
                  // (AGENTS.md: "Single source ... no inline redefinitions").
                  const rowClass = ROW_TINT[levelOf(row.docs)];
                  return (
                    <tr key={i} className={`border-b ${rowClass}`}>
                      <td className="py-2">{cleanFrameworkLabel(row.topic)}</td>
                      <td className="py-2">{row.docs === 0 ? "Not addressed" : levelLabel(row.docs)}</td>
                      <td className="py-2 font-mono">{row.docs}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
