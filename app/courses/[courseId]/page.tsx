import {
  AamcBarChart,
  AlignmentTable,
  CoverageHeatmap,
  MetricCard,
} from "@/components/dashboard/MetricCard";
import { getCourseSummary } from "@/lib/queries";
import { DEMO_SUMMARY } from "@/lib/demo-data";

export default async function CourseDashboardPage({
  params,
}: {
  params: { courseId: string };
}) {
  let summary = null;
  try {
    summary = await getCourseSummary(Number(params.courseId));
  } catch {
    summary = null;
  }

  const metrics = summary?.metrics ?? DEMO_SUMMARY.metrics;
  const aamcData =
    summary?.aamcDomainCoverage?.length
      ? summary.aamcDomainCoverage.map((d) => ({
          domain: d.domain.replace("Interpersonal & Communication Skills", "ICS").slice(0, 18),
          percent: d.percent,
        }))
      : DEMO_SUMMARY.aamcDomainCoverage.map((d) => ({
          domain: d.domain.slice(0, 18),
          percent: d.percent,
        }));

  const heatmap = summary?.heatmap ?? [];
  const alignments = summary?.recentAlignments ?? [];

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Course Dashboard</h1>
        <p className="text-rush-medium">Alignment health for RMD 563</p>
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
          cases={[1, 2, 3, 4]}
          domains={domains}
        />
      </div>

      <AlignmentTable
        rows={alignments.map((a) => ({
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
