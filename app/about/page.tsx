import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-bold text-rush-green">About RushMap AI</h1>
      <p className="mt-4 text-rush-medium">
        RushMap AI is a curriculum mapping demonstration for Rush Medical College. It ingests
        faculty guide documents and uses Azure AI Foundry to align learning content with the
        AAMC Physician Competency Reference Set, Core EPAs, and the USMLE 2025 Content Outline.
      </p>

      <div className="mt-8 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Frameworks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-rush-medium">
            <p><strong>AAMC PCRS</strong> — six competency domains with sub-competencies.</p>
            <p><strong>Core EPAs</strong> — thirteen entrustable professional activities.</p>
            <p><strong>USMLE 2025</strong> — organ systems, foundational sciences, and physician tasks.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Demo scope</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-rush-medium">
            This MVP is a public showcase with no login. The demo course is RMD 563
            &quot;Food to Fuel&quot; directed by Dr. Kathryn Solka. Faculty can approve or
            reject AI-generated alignments in the curriculum map drawer.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
