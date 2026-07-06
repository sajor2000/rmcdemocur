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
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { confidenceBadgeClass, formatConfidence } from "@/lib/utils";
import { aamcTakeaway, heatmapTakeaway } from "@/lib/coverage";

type MetricCardProps = {
  label: string;
  value: string;
  sub?: string;
  // "neutral" for metrics that aren't a coverage level (e.g. confidence) —
  // color stays reserved for actual coverage meaning (R12).
  variant?: "green" | "yellow" | "neutral";
};

export function MetricCard({ label, value, sub, variant = "green" }: MetricCardProps) {
  const ring =
    variant === "yellow"
      ? "border-partial-yellow"
      : variant === "neutral"
        ? "border-gray-300"
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
        <p className="font-takeaway text-sm italic text-rush-dark">{aamcTakeaway(data)}</p>
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
            <Bar dataKey="percent" fill="#006837" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/** Non-color redundancy (R12/design accessibility): a glyph per status so the
 * grid is legible without relying on color alone. */
const HEATMAP_GLYPH: Record<string, string> = { covered: "✓", partial: "◐", gap: "–" };

export function CoverageHeatmap({
  data,
  cases,
  systems,
}: {
  data: { caseNumber: number; system: string; status: string }[];
  cases: number[];
  systems: string[];
}) {
  // A O(1) lookup built once and shared by both the mobile strip and desktop
  // grid below, instead of each cell() call doing its own O(data.length)
  // linear find() — cell() runs once per (case, system) pair in each of the
  // two layouts, so the scan cost would otherwise be paid twice per cell.
  const statusByKey = new Map<string, string>();
  for (const d of data) {
    statusByKey.set(`${d.caseNumber}::${d.system}`, d.status);
  }

  const cell = (caseNum: number, system: string) => {
    const status = statusByKey.get(`${caseNum}::${system}`) ?? "gap";
    const color =
      status === "covered"
        ? "bg-covered-green"
        : status === "partial"
          ? "bg-partial-yellow"
          : "bg-gap-red";
    return (
      <div
        key={`${caseNum}-${system}`}
        className={`flex h-6 w-full min-w-[2rem] items-center justify-center rounded-sm text-xs font-medium text-white ${color}`}
        title={`Case ${caseNum} — ${system}: ${status}`}
      >
        {HEATMAP_GLYPH[status]}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>USMLE Domain Coverage Heatmap</CardTitle>
          <p className="font-takeaway mt-1 text-sm italic text-rush-dark">
            {heatmapTakeaway(cases, systems, data)}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-rush-medium">
          {[
            ["bg-covered-green", "covered", "Covered"],
            ["bg-partial-yellow", "partial", "Partial"],
            ["bg-gap-red", "gap", "Gap"],
          ].map(([c, key, label]) => (
            <span key={label} className="flex items-center gap-1">
              <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] text-white ${c}`}>
                {HEATMAP_GLYPH[key]}
              </span>
              {label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {/* Mobile (<640px): a per-system summary strip, not a shrunk grid — a
            dense case×system matrix doesn't reflow to a narrow screen without
            becoming illegible (R14, KTD source: small-multiples convention). */}
        <div className="space-y-2 sm:hidden">
          {systems.map((system) => (
            <div
              key={system}
              className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-2"
            >
              <span className="truncate text-xs font-medium">{system}</span>
              <div className="flex shrink-0 gap-1">
                {cases.map((c) => cell(c, system))}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden gap-1 sm:grid" style={{ gridTemplateColumns: `8rem repeat(${cases.length}, 1fr)` }}>
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
  // Computed once per row and shared by both the mobile list and desktop
  // table below — the CSS `sm:hidden`/`hidden sm:block` split only decides
  // which markup is visible, not which is computed (ultrareview finding).
  const decorated = rows.map((r) => {
    const confidencePct = Number(r.confidence ?? 0);
    return {
      ...r,
      confidenceClass: confidenceBadgeClass(confidencePct),
      confidenceLabel: formatConfidence(confidencePct),
    };
  });

  return (
    <Card data-mask="dynamic">
      <CardHeader>
        <CardTitle>Recent Alignments</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Below sm: a wide table in overflow-x-auto left every row's height
            set by off-screen wrapped Domain text, so mobile showed sparse
            excerpt fragments floating in dead vertical space with no scroll
            affordance (found in the U11 screenshot audit). ResponsiveTable
            renders a stacked card list instead — same data, no horizontal
            scroll needed. */}
        <ResponsiveTable
          rows={decorated}
          rowKey={(r) => r.id}
          columns={[
            { header: "Excerpt", className: "max-w-xs truncate pr-4", cell: (r) => r.excerpt ?? "—" },
            { header: "Framework", className: "pr-4", cell: (r) => r.framework },
            { header: "Domain", className: "pr-4", cell: (r) => r.frameworkLabel },
            {
              header: "Confidence",
              className: "pr-4",
              cell: (r) => <Badge className={r.confidenceClass}>{r.confidenceLabel}</Badge>,
            },
            { header: "Status", className: "capitalize", cell: (r) => r.status },
          ]}
          renderMobileCard={(r) => (
            <div className="rounded-md border border-gray-100 p-3 text-sm">
              <p className="text-rush-dark">{r.excerpt ?? "—"}</p>
              <p className="mt-1 text-xs text-rush-medium">
                {r.framework} · {r.frameworkLabel}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge className={r.confidenceClass}>{r.confidenceLabel}</Badge>
                <span className="text-xs capitalize text-rush-medium">{r.status}</span>
              </div>
            </div>
          )}
        />
      </CardContent>
    </Card>
  );
}
