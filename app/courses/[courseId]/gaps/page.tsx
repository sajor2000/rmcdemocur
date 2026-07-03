import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { suggestedGapAction } from "@/lib/gap-analyzer";
import { getCourseSummary, getGapExportRows } from "@/lib/queries";
import { DEMO_SUMMARY } from "@/lib/demo-data";

export default async function GapsPage({
  params,
}: {
  params: { courseId: string };
}) {
  const courseId = Number(params.courseId);
  let gaps: {
    frameworkLabel?: string | null;
    coverageStatus?: string | null;
    frameworkId?: string | null;
  }[] = DEMO_SUMMARY.gaps;
  let metrics = DEMO_SUMMARY.metrics;

  try {
    const summary = await getCourseSummary(courseId);
    if (summary) {
      gaps = summary.gaps;
      metrics = summary.metrics;
    }
  } catch {
    // demo fallback
  }

  let tableRows: {
    frameworkLabel: string | null;
    coverageStatus: string | null;
    chunkCount: number | null;
    avgConfidence: string | null;
  }[] = [];

  try {
    tableRows = await getGapExportRows(courseId);
  } catch {
    tableRows = gaps.map((g) => ({
      frameworkLabel: g.frameworkLabel ?? null,
      coverageStatus: g.coverageStatus ?? null,
      chunkCount: g.coverageStatus === "partial" ? 2 : 0,
      avgConfidence: g.coverageStatus === "partial" ? "0.61" : "0.00",
    }));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <p className="text-lg">
          RMD 563 covers <strong>{metrics.aamcCoveragePercent}%</strong> of AAMC PCRS
          competencies and <strong>{metrics.usmleDomainsCovered}</strong> of{" "}
          {metrics.usmleDomainsTotal} USMLE domains.{" "}
          <strong>{metrics.usmleGaps}</strong> gaps require attention.
        </p>
      </div>

      <div className="grid gap-4">
        {gaps
          .filter((g) => g.coverageStatus === "gap" || g.coverageStatus === "partial")
          .map((gap) => (
            <Card
              key={gap.frameworkId}
              className="border-2 border-gap-red"
            >
              <CardHeader>
                <CardTitle className="text-gap-red">{gap.frameworkLabel}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm capitalize">
                  Gap severity:{" "}
                  {gap.coverageStatus === "gap" ? "Not Covered" : "Partially Covered"}
                </p>
                <p className="text-sm text-rush-medium">
                  {suggestedGapAction(
                    gap.frameworkLabel ?? "",
                    gap.coverageStatus as "gap" | "partial" | "covered",
                  )}
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/courses/${courseId}/search?q=${encodeURIComponent(gap.frameworkLabel ?? "")}`}
                  >
                    Find Related Content
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
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
                <th className="pb-2">Domain</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Chunks</th>
                <th className="pb-2">Avg Confidence</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => {
                const pct = Number(row.avgConfidence ?? 0) * 100;
                const rowClass =
                  pct >= 80
                    ? "bg-green-50"
                    : pct >= 50
                      ? "bg-yellow-50"
                      : "bg-red-50";
                return (
                  <tr key={i} className={`border-b ${rowClass}`}>
                    <td className="py-2">{row.frameworkLabel}</td>
                    <td className="py-2 capitalize">{row.coverageStatus}</td>
                    <td className="py-2">{row.chunkCount}</td>
                    <td className="py-2 font-mono">{row.avgConfidence}</td>
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
