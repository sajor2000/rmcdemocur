"use client";

import { cn } from "@/lib/utils";

export type CaseScopeKey = "case" | "module" | "entire";

type Props = {
  scope: CaseScopeKey;
  moduleLabel: string;
  onChange: (scope: CaseScopeKey) => void;
};

const LABELS: Record<CaseScopeKey, (module: string) => string> = {
  case: () => "This case",
  module: (m) => `Module (${m})`,
  entire: () => "Entire curriculum",
};

export function CaseScopeBar({ scope, moduleLabel, onChange }: Props) {
  const keys: CaseScopeKey[] = ["case", "module", "entire"];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-rush-medium">Scope:</span>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "rounded-full px-3 py-1 text-sm transition-colors",
            scope === key
              ? "bg-rush-green text-white"
              : "border text-rush-medium hover:bg-gray-50",
          )}
        >
          {LABELS[key](moduleLabel)}
        </button>
      ))}
    </div>
  );
}
