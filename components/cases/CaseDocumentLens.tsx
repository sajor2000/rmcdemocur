"use client";

import { cn } from "@/lib/utils";
import type { CaseLensKey } from "@/lib/queries";

type Props = {
  lens: CaseLensKey;
  onChange: (lens: CaseLensKey) => void;
  hasFaculty: boolean;
  hasSelfStudy: boolean;
};

const OPTIONS: { key: CaseLensKey; label: string }[] = [
  { key: "all", label: "All documents" },
  { key: "faculty", label: "Faculty guide" },
  { key: "self_study", label: "Self-study" },
];

export function CaseDocumentLens({ lens, onChange, hasFaculty, hasSelfStudy }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-rush-medium">Document:</span>
      {OPTIONS.map((opt) => {
        const disabled =
          (opt.key === "faculty" && !hasFaculty) ||
          (opt.key === "self_study" && !hasSelfStudy);
        return (
          <button
            key={opt.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              lens === opt.key
                ? "border-rush-green bg-rush-green/10 text-rush-dark"
                : "border-gray-200 text-rush-medium hover:bg-gray-50",
              disabled && "cursor-not-allowed opacity-40",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
