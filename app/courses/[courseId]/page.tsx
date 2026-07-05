import {
  AamcBarChart,
  AlignmentTable,
  CoverageHeatmap,
  MetricCard,
} from "@/components/dashboard/MetricCard";
import { getCourseSummary } from "@/lib/queries";

export default async function CourseDashboardPage({
  params,
}: {
  params: { courseId: string };
}) {
  const courseId = Number(params.courseId);
  const summary = await getCourseSummary(courseId).catch(() => null);

  if (!summary?.course) {
    return (
      <div className="space-y-4 rounded-lg border border-dashed p-8 text-center">
        <h1 className="font-heading text-2xl font-bold">Course Dashboard</h1>
        <p className="text-rush-medium">
          No course data found. Run the bootstrap chain to seed Neon and process
          documents:
        </p>
        <pre className="mx-auto max-w-lg rounded bg-gray-50 p-4 text-left text-xs">
          npm run db:push{"\n"}
          npm run db:seed-frameworks{"\n"}
          npm run db:seed{"\n"}
          npm run db:process
        </pre>
      </div>
    );
  }

  const { metrics, aamcDomainCoverage, heatmap, usmleSystems, recentAlignments, targetSystems } =
    summary;
  const aamcData = aamcDomainCoverage.map((d) => ({
    domain: d.domain
      .replace("Interpersonal & Communication Skills", "Interpersonal & Comm.")
      .slice(0, 28),
    percent: d.percent,
  }));

  const caseNumbers = Array.from(
    new Set(
      summary.documents
        .map((d) => d.caseNumber)
        .filter((n): n is number => n != null),
    ),
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Course Dashboard</h1>
        <p className="text-rush-medium">
          Alignment health for {summary.course.code}
        </p>
        {targetSystems && (
          <p className="mt-1 text-sm text-rush-medium">
            USMLE coverage is scoped to this course&apos;s organ systems:{" "}
            <span className="font-medium text-rush-dark">
              {targetSystems.join(" · ")}
            </span>
            . Other systems are out of scope, not gaps.
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Overall AAMC Coverage"
          value={`${metrics.aamcCoveragePercent}%`}
          variant="green"
        />
        <MetricCard
          label={targetSystems ? "In-Scope USMLE Gaps" : "USMLE Gaps Detected"}
          value={String(metrics.usmleGaps)}
          variant="yellow"
        />
        <MetricCard
          label="Avg Alignment Confidence"
          value={metrics.avgConfidence.toFixed(2)}
          variant="blue"
        />
      </div>

      {metrics.alignmentsTotal > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">Human review progress</span>
            <span className="text-rush-medium">
              {metrics.alignmentsReviewed} of {metrics.alignmentsTotal} alignments
              reviewed (
              {Math.round(
                (metrics.alignmentsReviewed / metrics.alignmentsTotal) * 100,
              )}
              %)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-rush-green"
              style={{
                width: `${Math.round((metrics.alignmentsReviewed / metrics.alignmentsTotal) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <AamcBarChart data={aamcData} />
        <CoverageHeatmap
          data={heatmap}
          cases={caseNumbers.length ? caseNumbers : [1]}
          systems={usmleSystems}
        />
      </div>

      <AlignmentTable
        rows={recentAlignments.map((a) => ({
          id: a.id,
          excerpt: a.excerpt,
          framework: a.framework,
          frameworkLabel: a.frameworkLabel,
          confidence: a.confidence,
          status: a.status,
        }))}
      />
    </div>
  );
}
