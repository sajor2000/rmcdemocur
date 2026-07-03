import { ObjectivesExplorer, type ObjectiveRow, type ObjectivesSummary } from "@/components/objectives/ObjectivesExplorer";
import { getCourseObjectivesSummary } from "@/lib/queries";

export default async function ObjectivesPage({
  params,
}: {
  params: { courseId: string };
}) {
  const courseId = Number(params.courseId);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="font-heading text-2xl font-bold text-rush-dark">
          Learning Objectives
        </h1>
        <p className="mt-4 text-red-700">Invalid course id.</p>
      </div>
    );
  }

  let objectives: ObjectiveRow[];
  let summary: ObjectivesSummary;

  try {
    const data = await getCourseObjectivesSummary(courseId);
    objectives = data.rows.map((r) => ({
      id: r.objective.id,
      ordinal: r.objective.ordinal ?? 0,
      text: r.objective.text,
      sectionHeading: r.objective.sectionHeading,
      eoCode: r.objective.eoCode,
      extractionMethod: r.objective.extractionMethod,
      confidence: r.objective.confidence,
      caseNumber: r.document.caseNumber ?? 0,
      caseTitle: r.document.caseTitle,
      filename: r.document.filename,
    }));
    summary = {
      total: data.total,
      regexCount: data.regexCount,
      llmCount: data.llmCount,
      byCase: data.byCase,
    };
  } catch (error) {
    console.error(error);
    return (
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="font-heading text-2xl font-bold text-rush-dark">
          Learning Objectives
        </h1>
        <p className="mt-4 text-red-700">
          Failed to load objectives. Check database connection and run seed + process
          scripts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="font-heading text-2xl font-bold text-rush-dark">
          Learning Objectives
        </h1>
        <p className="mt-2 text-rush-medium">
          Objectives extracted from all course materials using regex-first parsing.
          LLM cleanup runs only when regex misses objectives or produces garbled output —
          it never rewrites or fabricates objectives.
        </p>
      </div>

      <ObjectivesExplorer objectives={objectives} summary={summary} />
    </div>
  );
}
