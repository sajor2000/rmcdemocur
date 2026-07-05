import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoverageSpectrum } from "@/components/coverage/CoverageSpectrum";
import { MethodExplainer } from "@/components/coverage/MethodExplainer";
import type { CoverageDist } from "@/lib/coverage";

/**
 * The course-level intensity card: method box + side-by-side USMLE/AAMC spectra.
 * Shared by the course dashboard and the gap-analysis page so both speak the
 * exact same vocabulary (the title is the only thing that varies).
 */
export function CoverageIntensityCard({
  title,
  usmleSpectrum,
  aamcSpectrum,
}: {
  title: string;
  usmleSpectrum: CoverageDist;
  aamcSpectrum: CoverageDist;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <MethodExplainer />
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">USMLE</p>
            <CoverageSpectrum dist={usmleSpectrum} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">AAMC</p>
            <CoverageSpectrum dist={aamcSpectrum} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
