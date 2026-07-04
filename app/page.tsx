import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCourseSummary } from "@/lib/queries";

// Without this, Next statically prerenders the page at build time and the
// "real" stats freeze (or bake in the no-DB placeholders) until the next deploy.
export const dynamic = "force-dynamic";

const DEMO_COURSE_ID = 1;

type LandingStat = { value: string; label: string };

/** Real landing stats from the database — no fabricated numbers. Coverage and
 * gap tiles read "Pending" until alignments exist (i.e. until the Azure-gated
 * reprocess has run), so we never show numbers computed against stub authorities
 * or pre-semantic chunks. */
async function getLandingStats(): Promise<LandingStat[]> {
  const courseLabel: LandingStat = { value: "RMD 563", label: "Food to Fuel" };
  try {
    const summary = await getCourseSummary(DEMO_COURSE_ID);
    if (!summary) {
      return [
        { value: "—", label: "Guides Processed (seed pending)" },
        courseLabel,
        { value: "—", label: "AAMC Coverage (seed pending)" },
        { value: "—", label: "USMLE Gaps (seed pending)" },
      ];
    }
    const { metrics } = summary;
    const hasAlignments = metrics.usmleDomainsCovered > 0 || metrics.aamcCoveragePercent > 0;
    return [
      { value: String(metrics.guidesProcessed), label: "Guides Processed" },
      courseLabel,
      hasAlignments
        ? { value: `${metrics.aamcCoveragePercent}%`, label: "AAMC Coverage" }
        : { value: "Pending", label: "AAMC Coverage (reprocess)" },
      hasAlignments
        ? { value: String(metrics.usmleGaps), label: "USMLE Gaps Detected" }
        : { value: "Pending", label: "USMLE Gaps (reprocess)" },
    ];
  } catch {
    // DB not configured (e.g. static preview): show honest placeholders, not fake numbers.
    return [
      { value: "—", label: "Guides Processed" },
      courseLabel,
      { value: "—", label: "AAMC Coverage" },
      { value: "—", label: "USMLE Gaps Detected" },
    ];
  }
}

function VennDiagram() {
  return (
    <svg viewBox="0 0 420 220" className="mx-auto h-48 w-full max-w-lg" aria-hidden>
      <circle cx="150" cy="110" r="70" fill="#00843D22" stroke="#00843D" strokeWidth="2" />
      <circle cx="210" cy="80" r="70" fill="#FFD10033" stroke="#D97706" strokeWidth="2" />
      <circle cx="270" cy="110" r="70" fill="#16A34A22" stroke="#16A34A" strokeWidth="2" />
      <text x="95" y="115" fontSize="11" fill="#353535">Rush Curriculum</text>
      <text x="188" y="55" fontSize="11" fill="#353535">AAMC PCRS/EPAs</text>
      <text x="255" y="115" fontSize="11" fill="#353535">USMLE 2025</text>
    </svg>
  );
}

export default async function HomePage() {
  const stats = await getLandingStats();
  return (
    <div>
      <section className="bg-gradient-to-br from-rush-green to-rush-green-dark px-4 py-16 text-white sm:px-6">
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="font-heading text-4xl font-bold sm:text-5xl">
            Map Every Lesson. Close Every Gap.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-green-50">
            AI-powered curriculum intelligence for Rush Medical College — aligned to
            AAMC standards and USMLE objectives.
          </p>
          <Button asChild size="lg" variant="outline" className="mt-8 border-white bg-white text-rush-green hover:bg-rush-light">
            <Link href="/courses/1">Explore the Demo →</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="mb-8 text-center font-heading text-2xl font-bold">How It Works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Upload Faculty Guides",
              body: "Drop PDF, DOCX, or PPTX faculty guides. RushMap parses cases, activities, and learning objectives automatically.",
            },
            {
              title: "AI Analyzes & Maps",
              body: "Azure AI Foundry maps each content chunk to AAMC PCRS competencies, Core EPAs, and USMLE 2025 domains.",
            },
            {
              title: "Identify Gaps & Report",
              body: "See coverage heatmaps, gap cards with suggested actions, and exportable reports for curriculum committees.",
            },
          ].map((step) => (
            <Card key={step.title}>
              <CardHeader>
                <CardTitle className="text-rush-green">{step.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-rush-medium">{step.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-gray-200 bg-white py-10">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 px-4 sm:grid-cols-4 sm:px-6">
          {stats.map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="font-heading text-3xl font-bold text-rush-green">{value}</p>
              <p className="text-sm text-rush-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 text-center sm:px-6">
        <h2 className="mb-6 font-heading text-2xl font-bold">Tri-Directional Alignment</h2>
        <VennDiagram />
        <p className="mt-4 text-rush-medium">
          Rush curriculum content linked to AAMC standards and USMLE objectives in one view.
        </p>
      </section>
    </div>
  );
}
