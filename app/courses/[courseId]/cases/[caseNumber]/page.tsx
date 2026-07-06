import { CaseAnalyticsView } from "@/components/cases/CaseAnalyticsView";
import { getCaseAnalytics } from "@/lib/queries";

export default async function CaseAnalyticsPage({
  params,
}: {
  params: { courseId: string; caseNumber: string };
}) {
  const courseId = Number(params.courseId);
  const caseNumber = Number(params.caseNumber);

  if (!Number.isFinite(courseId) || courseId <= 0 || !Number.isFinite(caseNumber)) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="font-heading text-2xl font-bold text-rush-dark">Case Analytics</h1>
        <p className="mt-4 text-red-700">Invalid course or case id.</p>
      </div>
    );
  }

  const data = await getCaseAnalytics(courseId, caseNumber).catch(() => null);

  if (!data) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="font-heading text-2xl font-bold text-rush-dark">Case Analytics</h1>
        <p className="mt-4 text-rush-medium">
          No data found for case {caseNumber}. Run bootstrap and process documents first.
        </p>
      </div>
    );
  }

  return <CaseAnalyticsView courseId={courseId} data={data} />;
}
