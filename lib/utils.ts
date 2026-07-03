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
