"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { confidenceBadgeClass, formatConfidence } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  sub?: string;
  variant?: "green" | "yellow" | "blue";
};

export function MetricCard({ label, value, sub, variant = "green" }: MetricCardProps) {
  const ring =
    variant === "yellow"
      ? "border-partial-yellow"
      : variant === "blue"
        ? "border-blue-500"
        : "border-covered-green";
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full border-4 ${ring} font-heading text-lg font-bold`}
        >
          {value}
        </div>
        <div>
          <p className="text-sm text-rush-medium">{label}</p>
          {sub && <p className="text-xs text-gray-500">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function AamcBarChart({
  data,
}: {
  data: { domain: string; percent: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AAMC PCRS Domain Coverage</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          {/* Horizontal layout so domain names read left-to-right in full,
              instead of rotated + truncated on a vertical x-axis. */}
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="domain"
              width={150}
              tick={{ fontSize: 11 }}
              interval={0}
            />
            <Tooltip />
            <Bar dataKey="percent" fill="#00843D" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function CoverageHeatmap({
  data,
  cases,
  systems,
}: {
  data: { caseNumber: number; system: string; status: string }[];
  cases: number[];
  systems: string[];
}) {
  const cell = (caseNum: number, system: string) => {
    const hit = data.find(
      (d) => d.caseNumber === caseNum && d.system === system,
    );
    const status = hit?.status ?? "gap";
    const color =
      status === "covered"
        ? "bg-covered-green"
        : status === "partial"
          ? "bg-partial-yellow"
          : "bg-gap-red";
    return (
      <div
        key={`${caseNum}-${system}`}
        className={`h-6 w-full min-w-[2rem] rounded-sm ${color}`}
        title={`Case ${caseNum} — ${system}: ${status}`}
      />
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>USMLE Domain Coverage Heatmap</CardTitle>
        <div className="flex items-center gap-3 text-xs text-rush-medium">
          {[
            ["bg-covered-green", "Covered"],
            ["bg-partial-yellow", "Partial"],
            ["bg-gap-red", "Gap"],
          ].map(([c, label]) => (
            <span key={label} className="flex items-center gap-1">
              <span className={`h-3 w-3 rounded-sm ${c}`} />
              {label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="grid gap-1" style={{ gridTemplateColumns: `8rem repeat(${cases.length}, 1fr)` }}>
          <div />
          {cases.map((c) => (
            <div key={c} className="text-center text-xs font-medium">
              Case {c}
            </div>
          ))}
          {systems.map((system) => (
            <React.Fragment key={system}>
              <div className="truncate pr-2 text-xs">{system}</div>
              {cases.map((c) => (
                <div key={`${system}-${c}`}>{cell(c, system)}</div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AlignmentTable({
  rows,
}: {
  rows: {
    id: number;
    excerpt?: string;
    framework: string | null;
    frameworkLabel: string | null;
    confidence: string | null;
    status: string | null;
  }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Alignments</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-rush-medium">
              <th className="pb-2 pr-4">Excerpt</th>
              <th className="pb-2 pr-4">Framework</th>
              <th className="pb-2 pr-4">Domain</th>
              <th className="pb-2 pr-4">Confidence</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100">
                <td className="max-w-xs truncate py-2 pr-4">{r.excerpt ?? "—"}</td>
                <td className="py-2 pr-4">{r.framework}</td>
                <td className="py-2 pr-4">{r.frameworkLabel}</td>
                <td className="py-2 pr-4">
                  <Badge
                    className={confidenceBadgeClass(Number(r.confidence ?? 0))}
                  >
                    {formatConfidence(Number(r.confidence ?? 0))}
                  </Badge>
                </td>
                <td className="py-2 capitalize">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
