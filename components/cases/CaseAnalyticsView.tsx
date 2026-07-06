"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CoverageSpectrum } from "@/components/coverage/CoverageSpectrum";
import { MethodExplainer } from "@/components/coverage/MethodExplainer";
import { CASE_SCOPE_NOTE } from "@/lib/coverage";
import type { CaseAnalyticsData } from "@/lib/queries";
import { CaseScopeBar, type CaseScopeKey } from "@/components/cases/CaseScopeBar";
import { cn } from "@/lib/utils";

type Props = {
  courseId: number;
  data: CaseAnalyticsData;
};

const HEATMAP_COLORS: Record<string, string> = {
  covered: "bg-covered-green",
  partial: "bg-partial-yellow",
  gap: "bg-gap-red",
};

export function CaseAnalyticsView({ courseId, data }: Props) {
  const [scope, setScope] = useState<CaseScopeKey>("case");
  const { case: caseMeta, documents, objectives, alignments, scopes, heatmap, targetSystems } =
    data;

  const activeSpectrum =
    scope === "case"
      ? { usmle: scopes.case.usmle, aamc: scopes.case.aamc }
      : scope === "module"
        ? { usmle: scopes.module.usmle, aamc: scopes.module.aamc }
        : { usmle: scopes.entire.usmle, aamc: scopes.entire.aamc };

  const base = `/courses/${courseId}`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-rush-medium">
          Case {caseMeta.number} · {caseMeta.module}
        </p>
        <h1 className="font-heading text-2xl font-bold text-rush-dark">
          {caseMeta.title ?? `Case ${caseMeta.number}`}
        </h1>
        {caseMeta.diagnosis && (
          <p className="mt-1 text-sm text-rush-medium">{caseMeta.diagnosis}</p>
        )}
        {targetSystems && (
          <p className="mt-2 text-sm text-rush-medium">
            USMLE metrics use this course&apos;s organ scope:{" "}
            <span className="font-medium text-rush-dark">{targetSystems.join(" · ")}</span>
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link
            href={`${base}/map?case=${caseMeta.number}`}
            className="rounded border px-3 py-1 hover:bg-gray-50"
          >
            Curriculum map
          </Link>
          <Link
            href={`${base}/objectives?case=${caseMeta.number}`}
            className="rounded border px-3 py-1 hover:bg-gray-50"
          >
            Learning objectives
          </Link>
        </div>
      </div>

      <CaseScopeBar
        scope={scope}
        moduleLabel={caseMeta.module}
        onChange={setScope}
      />

      {scope === "module" && (
        <p className="-mt-2 text-xs text-rush-medium">
          <strong>{scopes.module.label}</strong> coverage is measured against the{" "}
          <em>full</em> USMLE and AAMC framework — read this as the module&apos;s share of
          the whole curriculum, not an organ-scoped denominator.
        </p>
      )}

      {scope === "entire" && (
        <p className="-mt-2 text-xs text-rush-medium">
          Entire curriculum aggregates all courses against the full framework — same as the{" "}
          <Link href="/program" className="text-rush-green hover:underline">
            program view
          </Link>
          .
        </p>
      )}

      {scope === "case" && (
        <p className="-mt-2 text-xs text-rush-medium">{CASE_SCOPE_NOTE}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-rush-medium">
              Objectives
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-bold">{objectives.total}</p>
            <p className="mt-1 text-xs text-rush-medium">
              {objectives.regex} regex · {objectives.llm} LLM cleanup
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-rush-medium">
              Alignments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-bold">{alignments.total}</p>
            <p className="mt-1 text-xs text-rush-medium">
              {alignments.reviewed} reviewed · avg {alignments.avgConfidence.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-rush-medium">
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-bold">{documents.length}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {documents.map((d) => (
                <Badge key={d.id} className="text-xs bg-gray-100">
                  {d.guideKind === "faculty" ? "Faculty" : "Self-study"}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Coverage intensity —{" "}
            {scope === "case"
              ? `Case ${caseMeta.number}`
              : scope === "module"
                ? scopes.module.label
                : "Entire curriculum"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scope === "case" && <MethodExplainer />}
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">USMLE</p>
              <CoverageSpectrum dist={activeSpectrum.usmle} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">AAMC</p>
              <CoverageSpectrum dist={activeSpectrum.aamc} />
            </div>
          </div>
        </CardContent>
      </Card>

      {scope === "case" && heatmap.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>USMLE breadth by organ system (this case)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {heatmap.map((cell) => (
                <div
                  key={cell.system}
                  className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
                  title={`${cell.system}: ${cell.status}`}
                >
                  <span
                    className={cn("h-3 w-3 rounded-sm", HEATMAP_COLORS[cell.status])}
                  />
                  <span className="max-w-[10rem] truncate">{cell.system}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {scope === "case" && scopes.case.topTopics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top framework topics (this case)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {scopes.case.topTopics.map((t) => (
                <li key={t.label} className="flex justify-between gap-4">
                  <span className="truncate">{t.label}</span>
                  <span className="shrink-0 text-rush-medium">{t.chunks} passages</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
