"use client";

import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ObjectiveRow = {
  id: number;
  ordinal: number;
  text: string;
  sectionHeading: string | null;
  eoCode: string | null;
  extractionMethod: string | null;
  confidence: string | null;
  caseNumber: number;
  caseTitle: string | null;
  filename: string;
};

export type ObjectivesSummary = {
  total: number;
  regexCount: number;
  llmCount: number;
  byCase: { caseNumber: number; caseTitle: string | null; count: number }[];
};

type Props = {
  objectives: ObjectiveRow[];
  summary: ObjectivesSummary;
};

export function ObjectivesExplorer({ objectives, summary }: Props) {
  const [caseFilter, setCaseFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return objectives.filter((o) => {
      if (caseFilter !== "all" && String(o.caseNumber) !== caseFilter) return false;
      if (methodFilter === "regex" && o.extractionMethod !== "regex") return false;
      if (methodFilter === "llm" && o.extractionMethod !== "llm_cleanup") return false;
      if (search && !o.text.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [objectives, caseFilter, methodFilter, search]);

  const cases = summary.byCase.length > 0
    ? summary.byCase
    : Array.from(new Set(objectives.map((o) => o.caseNumber))).map((n) => ({
        caseNumber: n,
        caseTitle: objectives.find((o) => o.caseNumber === n)?.caseTitle ?? null,
        count: objectives.filter((o) => o.caseNumber === n).length,
      }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-rush-medium">
              Total Objectives
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-bold text-rush-dark">
              {summary.total}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-rush-medium">
              Regex Extracted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-bold text-covered-green">
              {summary.regexCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-rush-medium">
              LLM Cleanup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-bold text-rush-green">
              {summary.llmCount}
            </p>
            <p className="mt-1 text-xs text-rush-medium">
              Only when regex misses or mangles — never rewrites
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Objectives by Case</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {cases.map((c) => (
              <button
                key={c.caseNumber}
                type="button"
                onClick={() =>
                  setCaseFilter(
                    caseFilter === String(c.caseNumber) ? "all" : String(c.caseNumber),
                  )
                }
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  caseFilter === String(c.caseNumber)
                    ? "border-rush-green bg-rush-green/10"
                    : "hover:bg-gray-50",
                )}
              >
                <span className="font-medium">Case {c.caseNumber}</span>
                <span className="ml-2 text-rush-medium">{c.count} obj.</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Learning Objectives Table</CardTitle>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              placeholder="Filter objectives..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md border px-3 py-1.5 text-sm"
            />
            <select
              value={caseFilter}
              onChange={(e) => setCaseFilter(e.target.value)}
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              <option value="all">All cases</option>
              {cases.map((c) => (
                <option key={c.caseNumber} value={String(c.caseNumber)}>
                  Case {c.caseNumber}: {c.caseTitle}
                </option>
              ))}
            </select>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              <option value="all">All methods</option>
              <option value="regex">Regex only</option>
              <option value="llm">LLM cleanup only</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-rush-medium">
                <th className="pb-2 pr-4">Case</th>
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">Objective</th>
                <th className="pb-2 pr-4">Section</th>
                <th className="pb-2 pr-4">EO Code</th>
                <th className="pb-2">Method</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((obj) => (
                <Fragment key={obj.id}>
                  <tr
                    className="cursor-pointer border-b hover:bg-gray-50"
                    onClick={() =>
                      setExpandedId(expandedId === obj.id ? null : obj.id)
                    }
                  >
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {obj.caseNumber}
                    </td>
                    <td className="py-3 pr-4">{obj.ordinal}</td>
                    <td className="py-3 pr-4 max-w-lg">{obj.text}</td>
                    <td className="py-3 pr-4 text-rush-medium whitespace-nowrap">
                      {obj.sectionHeading ?? "—"}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      {obj.eoCode ?? "—"}
                    </td>
                    <td className="py-3">
                      <Badge
                        className={
                          obj.extractionMethod === "llm_cleanup"
                            ? "bg-rush-green text-white border-rush-green"
                            : "bg-gray-100 text-rush-dark"
                        }
                      >
                        {obj.extractionMethod === "llm_cleanup" ? "LLM" : "Regex"}
                      </Badge>
                    </td>
                  </tr>
                  {expandedId === obj.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={6} className="px-4 py-3 text-xs text-rush-medium">
                        <p>
                          <strong>Source file:</strong> {obj.filename}
                        </p>
                        <p className="mt-1">
                          <strong>Confidence:</strong> {obj.confidence ?? "unknown"}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-rush-medium">
                    No objectives match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
