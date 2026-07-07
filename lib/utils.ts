import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatConfidence(value: number): string {
  return value.toFixed(2);
}

export function confidenceBadgeClass(confidence: number): string {
  if (confidence >= 0.8) {
    return "bg-green-100 text-green-800 border border-green-300";
  }
  if (confidence >= 0.6) {
    return "bg-yellow-100 text-yellow-800 border border-yellow-300";
  }
  return "bg-red-100 text-red-800 border border-red-300";
}

/**
 * Collapse a framework label that had its own full text appended twice, e.g.
 * "PC5: Patient Care — … judgment. — Patient Care — … judgment." -> the single
 * "PC5: Patient Care — … judgment." Some gap rows were written with a doubled
 * label; normalize at render instead of re-processing every alignment.
 */
/**
 * A short scope hint for a framework leaf, derived from its fullText, so a terse
 * subdomain label on a gap card is not misread. The USMLE node whose subdomain
 * is just "pancreas" actually scopes "metastatic neoplasms" — showing that
 * stops faculty reading "pancreas — Not addressed" as "pancreatitis missing"
 * (pancreatitis lives in the covered "Disorders of the pancreas" node). Returns
 * undefined when fullText is empty or merely restates the label.
 */
export function frameworkScopeDetail(
  subdomain: string | null | undefined,
  fullText: string | null | undefined,
  maxLen = 120,
): string | undefined {
  const ft = (fullText ?? "").trim();
  if (!ft) return undefined;
  const sub = (subdomain ?? "").trim().toLowerCase();
  if (sub && ft.toLowerCase().startsWith(sub)) return undefined;
  return ft.length > maxLen ? `${ft.slice(0, maxLen).trimEnd()}…` : ft;
}

export function cleanFrameworkLabel(label: string | null | undefined): string {
  const s = (label ?? "").trim();
  if (!s) return s;
  const m = s.match(/^([A-Za-z]+\d*:\s+)([\s\S]*)$/);
  const prefix = m ? m[1] : "";
  const body = m ? m[2] : s;
  const sep = " — ";
  for (let i = body.indexOf(sep); i !== -1; i = body.indexOf(sep, i + 1)) {
    if (body.slice(0, i) === body.slice(i + sep.length)) {
      return prefix + body.slice(0, i);
    }
  }
  return prefix + body;
}
