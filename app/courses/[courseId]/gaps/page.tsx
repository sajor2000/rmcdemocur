import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { suggestedGapAction } from "@/lib/gap-analyzer";
import { getCourseSummary } from "@/lib/queries";
import { levelLabel, levelOf } from "@/lib/coverage";
import { type CoveredElsewhere } from "@/lib/course-scope";
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

// Shared by the USMLE and AAMC "not addressed" sections — one gap-card shape
// so an actionable CTA (suggestedGapAction + search link) isn't tied to a
// single framework (ultrareview finding: AAMC gaps had silently lost this).
function GapCard({
  courseId,
  gap,
}: {
  courseId: number;
  gap: {
    framework: string;
    system: string;
    topic: string;
    coveredElsewhere?: CoveredElsewhere;
  };
}) {
  const label = cleanFrameworkLabel(gap.topic);
  const elsewhere = gap.coveredElsewhere;
  return (
    <Card key={`${gap.framework}-${gap.system}-${label}`} className="border-l-4 border-gap-red">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle className="text-base font-semibold">{label}</CardTitle>
        {/* "Not addressed" stays the primary status — this IS a gap for this
            course. A covered-elsewhere note is rendered as a subordinate line
            below, never as a competing status. */}
        <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
          Not addressed
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {elsewhere && (
          // Distinguished by an icon + text, not color alone (accessibility):
          // an unverified curatorial note, explicitly labeled as such (KTD3).
          <p className="flex items-start gap-1.5 text-sm text-rush-medium">
            <span aria-hidden="true">↪</span>
            <span>
              Noted as taught in <span className="font-medium text-rush-dark">{elsewhere.course}</span> — not
              verified by this tool ({elsewhere.assertedBy}, {elsewhere.assertedOn}).
            </span>
          </p>
        )}
        <p className="text-sm text-rush-medium">{suggestedGapAction(label)}</p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/courses/${courseId}/search?q=${encodeURIComponent(label)}`}>
            Find Related Content
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

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
  const tableRows = topicRows;

  // Cards are for the truly actionable bucket (0 documents) — "Introduced"
  // (1 document) topics are already counted in the intensity spectrum above,
  // remain in the full Coverage Table below, and rendering all ~100+ thin
  // topics as individual cards made the page unusably long, capped here at
  // CARD_LIMIT for the same reason (found in the U11 screenshot audit).
  // Both scoped to USMLE only so the counts match the headline sentence's
  // metrics.usmleGaps exactly (one number, one methodology — AE2). AAMC gaps
  // remain fully visible, framework-labeled, in the table/CSV and their own
  // section below. Each bucket states its own condition directly via
  // levelOf() (lib/coverage.ts) — the single source of thresholds
  // (AGENTS.md) — rather than being derived by subtraction from the other.
  const notAddressed = topicRows.filter((r) => r.framework === "USMLE" && levelOf(r.docs) === "gap");
  const introducedCount = topicRows.filter(
    (r) => r.framework === "USMLE" && levelOf(r.docs) === "introduced",
  ).length;
  const CARD_LIMIT = 12;
  const shownGaps = notAddressed.slice(0, CARD_LIMIT);
  const hiddenGapCount = notAddressed.length - shownGaps.length;

  // AAMC is cross-cutting (never organ-scoped), so its own not-addressed
  // count doesn't participate in the USMLE headline/section agreement above.
  const aamcNotAddressed = topicRows.filter((r) => r.framework === "AAMC" && levelOf(r.docs) === "gap");
  const shownAamcGaps = aamcNotAddressed.slice(0, CARD_LIMIT);
  const hiddenAamcGapCount = aamcNotAddressed.length - shownAamcGaps.length;

  // Computed once per row and shared by the mobile list and desktop table
  // below (~230 catalog rows) — the CSS split only decides which markup is
  // visible, not which is computed (ultrareview finding).
  const decoratedTableRows = tableRows.map((row) => ({
    ...row,
    rowClass: ROW_TINT[levelOf(row.docs)],
    levelText: row.docs === 0 ? "Not addressed" : levelLabel(row.docs),
    cleanTopic: cleanFrameworkLabel(row.topic),
  }));

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
        {shownGaps.map((gap) => (
          <GapCard key={`${gap.framework}-${gap.system}-${gap.topic}`} courseId={courseId} gap={gap} />
        ))}
      </div>
      {hiddenGapCount > 0 && (
        <p className="text-sm text-rush-medium">
          {hiddenGapCount} more not-addressed topic{hiddenGapCount === 1 ? "" : "s"} — see the full
          list in the Coverage Table below or the CSV export.
        </p>
      )}

      {/* AAMC is cross-cutting, never organ-scoped (AGENTS.md) — its own
          section with its own accurate count, so scoping the USMLE section
          above didn't leave AAMC gaps without an actionable card (ultrareview
          finding: they'd silently lost suggestedGapAction + the search CTA). */}
      {aamcNotAddressed.length > 0 && (
        <>
          <div>
            <h2 className="font-heading text-lg font-semibold">Not addressed (AAMC)</h2>
            <p className="text-sm text-rush-medium">
              AAMC PCRS/EPA competencies with no curriculum document addressing them yet —{" "}
              {aamcNotAddressed.length} total, cross-cutting (not organ-scoped).
            </p>
          </div>
          <div className="grid gap-4">
            {shownAamcGaps.map((gap) => (
              <GapCard key={`${gap.framework}-${gap.system}-${gap.topic}`} courseId={courseId} gap={gap} />
            ))}
          </div>
          {hiddenAamcGapCount > 0 && (
            <p className="text-sm text-rush-medium">
              {hiddenAamcGapCount} more not-addressed AAMC topic{hiddenAamcGapCount === 1 ? "" : "s"} —
              see the full list in the Coverage Table below or the CSV export.
            </p>
          )}
        </>
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
              (verified: 401px table in a 292px container) — ResponsiveTable
              renders a stacked list instead, no horizontal scroll needed
              (found in the U11 screenshot audit). */}
          <ResponsiveTable
            rows={decoratedTableRows}
            rowKey={(row) => `${row.framework}-${row.system}-${row.topic}`}
            stickyHeader
            rowClassName={(row) => row.rowClass}
            columns={[
              { header: "Topic", cell: (row) => row.cleanTopic },
              { header: "Level", cell: (row) => row.levelText },
              { header: "Documents", className: "font-mono", cell: (row) => row.docs },
            ]}
            renderMobileCard={(row) => (
              <div className={`rounded-md border-b p-2 text-sm ${row.rowClass}`}>
                <p>{row.cleanTopic}</p>
                <p className="mt-1 text-xs text-rush-medium">
                  {row.levelText} · {row.docs} doc{row.docs === 1 ? "" : "s"}
                </p>
              </div>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
