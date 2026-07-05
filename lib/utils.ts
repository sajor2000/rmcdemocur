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

export function coverageColor(status: string): string {
  if (status === "covered") return "bg-covered-green";
  if (status === "partial") return "bg-partial-yellow";
  return "bg-gap-red";
}

/**
 * Collapse a framework label that had its own full text appended twice, e.g.
 * "PC5: Patient Care — … judgment. — Patient Care — … judgment." -> the single
 * "PC5: Patient Care — … judgment." Some gap rows were written with a doubled
 * label; normalize at render instead of re-processing every alignment.
 */
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
