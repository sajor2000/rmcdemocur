// The only caller (the gaps page's GapCard) only ever renders this for
// docs === 0 topics, so this always describes closing a gap — no
// covered/partial branch, since nothing calls this for those statuses.
export function suggestedGapAction(frameworkLabel: string): string {
  return `Consider adding a case or lecture addressing ${frameworkLabel} to close this coverage gap.`;
}
