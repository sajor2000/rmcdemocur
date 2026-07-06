"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoverageSpectrum, IntensityBar } from "@/components/coverage/CoverageSpectrum";
import { MethodExplainer } from "@/components/coverage/MethodExplainer";
import { type CoverageDist } from "@/lib/coverage";

type System = { system: string } & CoverageDist;

export type ProgramData = {
  scopes: string[];
  metrics: { courses: number; documents: number };
  usmle: { total: number; byScope: Record<string, CoverageDist> };
  aamc: { total: number; byScope: Record<string, CoverageDist> };
  systems: System[];
  mostCovered: {
    label: string;
    docs: number;
    courses: number;
    chunks: number;
    sessions: number[];
  }[];
};

export function ProgramView({ program }: { program: ProgramData }) {
  const [scope, setScope] = useState(program.scopes[0]);
  const { metrics, usmle, aamc, systems, mostCovered } = program;
  const objectivesModuleQuery =
    scope === "Entire curriculum" ? "" : `&module=${encodeURIComponent(scope)}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Program Curriculum Coverage</h1>
        <p className="mt-1 text-rush-medium">
          All {metrics.courses} course{metrics.courses === 1 ? "" : "s"} ({metrics.documents}{" "}
          documents), measured against the full USMLE and AAMC framework. Individual{" "}
          <Link href="/courses/1" className="text-rush-green hover:underline">
            course pages
          </Link>{" "}
          are scoped to their own organ systems; this program view is not.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="text-rush-medium">Download coverage:</span>
          <a href="/api/program/export?format=csv" className="rounded border px-3 py-1 hover:bg-gray-50">
            CSV (spreadsheet)
          </a>
          <a href="/api/program/export?format=json" className="rounded border px-3 py-1 hover:bg-gray-50">
            JSON
          </a>
          <span className="self-center text-xs text-rush-medium">
            (entire curriculum — not scoped by selector below)
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <span className="text-rush-medium">Download objectives:</span>
          <a
            href={`/api/program/objectives/export?format=csv${objectivesModuleQuery}`}
            className="rounded border px-3 py-1 hover:bg-gray-50"
          >
            CSV (spreadsheet)
          </a>
          <a
            href={`/api/program/objectives/export?format=json${objectivesModuleQuery}`}
            className="rounded border px-3 py-1 hover:bg-gray-50"
          >
            JSON
          </a>
          {scope !== "Entire curriculum" && (
            <span className="self-center text-xs text-rush-medium">
              scoped to {scope}
            </span>
          )}
        </div>
      </div>

      <MethodExplainer />

      {/* Scope: entire curriculum, or a single module (M1/M2). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-rush-medium">Scope:</span>
        {program.scopes.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              scope === s
                ? "bg-rush-green text-white"
                : "border text-rush-medium hover:bg-gray-50"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* A module addresses a subset of the whole framework, so the denominator
          stays the full framework — this is the module's SHARE of it, not an
          organ-scoped module metric (which would understate what a module owes). */}
      {scope !== program.scopes[0] && (
        <p className="-mt-2 text-xs text-rush-medium">
          <strong>{scope}</strong> coverage is measured against the <em>full</em> USMLE and
          AAMC framework — one module addresses a subset of topics, so most read as gaps by
          design. Read this as the module&apos;s share of the whole framework, not a
          module-scoped denominator.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>USMLE coverage — {scope}</CardTitle>
          </CardHeader>
          <CardContent>
            <CoverageSpectrum dist={usmle.byScope[scope]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AAMC coverage — {scope}</CardTitle>
          </CardHeader>
          <CardContent>
            <CoverageSpectrum dist={aamc.byScope[scope]} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>USMLE coverage by organ system (entire curriculum)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-rush-medium">
                <th className="pb-2 pr-4">System</th>
                <th className="pb-2 pr-4">Addressed</th>
                <th className="pb-2 pr-4">Gaps</th>
                <th className="pb-2">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((s) => (
                <tr key={s.system} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{s.system}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {s.addressed}/{s.total}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{s.gap}</td>
                  <td className="py-2">
                    <IntensityBar dist={s} className="h-3 w-40 rounded-sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Most-addressed topics — learning spiral</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-rush-medium">
            How the most-reinforced topics are introduced then revisited across sessions —
            spiral reinforcement, or a consolidation candidate when spread thin.
          </p>
          <ul className="space-y-2 text-sm">
            {mostCovered.map((m) => (
              <li key={m.label} className="space-y-0.5">
                <div className="flex items-center justify-between gap-4">
                  <span className="truncate">{m.label}</span>
                  <span
                    className="shrink-0 cursor-help text-rush-medium"
                    title={`Addressed in ${m.docs} documents across ${m.courses} course(s), ${m.chunks} passages.`}
                  >
                    {m.docs} docs
                  </span>
                </div>
                {m.sessions.length > 0 && (
                  <p className="text-xs text-rush-medium">
                    Sessions {m.sessions.join(" → ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
