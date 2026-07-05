import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { suggestedGapAction } from "@/lib/gap-analyzer";
import { getCourseSummary, getGapExportRows } from "@/lib/queries";
import { levelLabel } from "@/lib/coverage";
import { cleanFrameworkLabel } from "@/lib/utils";
import { CoverageIntensityCard } from "@/components/coverage/CoverageIntensityCard";

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

  const { gaps, metrics, targetSystems, usmleSpectrum, aamcSpectrum } = summary;
  const tableRows = await getGapExportRows(courseId).catch(() => []);

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
        <h2 className="font-heading text-lg font-semibold">Specific gaps</h2>
        <p className="text-sm text-rush-medium">
          Individual framework topics not yet addressed, or addressed in only one document.
        </p>
      </div>

      <div className="grid gap-4">
        {gaps.map((gap) => {
          const label = cleanFrameworkLabel(gap.topic);
          const isGap = gap.docs === 0;
          const tone = isGap
            ? { border: "border-gap-red", chip: "bg-red-100 text-red-800" }
            : { border: "border-partial-yellow", chip: "bg-yellow-100 text-yellow-800" };
          return (
            <Card
              key={`${gap.framework}-${gap.system}-${label}`}
              className={`border-l-4 ${tone.border}`}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <CardTitle className="text-base font-semibold">{label}</CardTitle>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone.chip}`}
                >
                  {isGap ? "Not addressed" : levelLabel(gap.docs)}
                </span>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-rush-medium">
                  {suggestedGapAction(label, isGap ? "gap" : "partial")}
                </p>
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Coverage Table</CardTitle>
          <Button asChild size="sm">
            <a href={`/api/courses/${courseId}/export`}>Export Gap Report (CSV)</a>
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2">Topic</th>
                <th className="pb-2">Level</th>
                <th className="pb-2">Documents</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => {
                const rowClass =
                  row.docs === 0
                    ? "bg-red-50"
                    : row.docs <= 3
                      ? "bg-yellow-50"
                      : "bg-green-50";
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
        </CardContent>
      </Card>
    </div>
  );
}
