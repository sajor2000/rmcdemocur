export type CoverageStatus = "covered" | "partial" | "gap";

export function suggestedGapAction(
  frameworkLabel: string,
  status: CoverageStatus,
): string {
  if (status === "gap") {
    return `Consider adding a case or lecture addressing ${frameworkLabel} to close this coverage gap.`;
  }
  return `Review existing ${frameworkLabel} content and strengthen activities with partial alignment.`;
}
