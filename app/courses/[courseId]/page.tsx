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

  const { metrics, aamcDomainCoverage, heatmap, recentAlignments } = summary;
  const aamcData = aamcDomainCoverage.map((d) => ({
    domain: d.domain.replace("Interpersonal & Communication Skills", "ICS").slice(0, 18),
    percent: d.percent,
  }));

  const domains = [
    "Gastrointestinal",
    "Hepatobiliary",
    "Renal/Urinary",
    "Cardiovascular",
    "Pulmonary",
    "Neurology/Psychiatry",
    "Endocrine",
    "Dermatology",
    "Multisystem/General Principles",
    "Pharmacology",
    "Microbiology/Immunology",
    "Pathology",
  ];

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
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Overall AAMC Coverage"
          value={`${metrics.aamcCoveragePercent}%`}
          variant="green"
        />
        <MetricCard
          label="USMLE Gaps Detected"
          value={String(metrics.usmleGaps)}
          variant="yellow"
        />
        <MetricCard
          label="Avg Alignment Confidence"
          value={metrics.avgConfidence.toFixed(2)}
          variant="blue"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AamcBarChart data={aamcData} />
        <CoverageHeatmap
          data={heatmap.map((h) => ({
            caseNumber: h.caseNumber,
            domainId: h.domainId,
            status: h.status,
          }))}
          cases={caseNumbers.length ? caseNumbers : [1]}
          domains={domains}
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
