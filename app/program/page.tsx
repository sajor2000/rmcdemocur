import { getProgramSummary } from "@/lib/queries";
import { ProgramView } from "@/components/program/ProgramView";

export const dynamic = "force-dynamic";

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

  return <ProgramView program={program} />;
}
