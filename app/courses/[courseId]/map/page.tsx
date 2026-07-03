"use client";

import { useCallback, useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { CurriculumTree } from "@/components/map/CurriculumTree";
import { FrameworkTree } from "@/components/map/FrameworkTree";
import { AlignmentDrawer } from "@/components/map/AlignmentDrawer";

type Alignment = {
  id: number;
  framework: string | null;
  frameworkId: string | null;
  frameworkLabel: string | null;
  confidence: string | null;
  rationale: string | null;
  status: string | null;
  chunkId: number;
};

export default function MapPage({ params }: { params: { courseId: string } }) {
  const [data, setData] = useState<{
    documents: { id: number; caseNumber: number | null; caseTitle: string | null }[];
    chunks: { chunk: { id: number; section: string | null; content: string }; document: { caseNumber: number | null; caseTitle: string | null } }[];
    alignments: { alignment: Alignment; chunkId: number }[];
    aamc: { subId: string | null; domainName: string | null; description: string | null }[];
    usmle: { domain: string | null; subdomain: string | null }[];
  } | null>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<number | null>(null);
  const [caseFilter, setCaseFilter] = useState<string>("all");
  const [frameworkFilter, setFrameworkFilter] = useState<string>("all");
  const [confidenceMin, setConfidenceMin] = useState(0.5);
  const [drawerAlignment, setDrawerAlignment] = useState<Alignment | null>(null);

  useEffect(() => {
    fetch(`/api/courses/${params.courseId}/map`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [params.courseId]);

  const filteredAlignments =
    data?.alignments.filter((a) => {
      const conf = Number(a.alignment.confidence ?? 0);
      if (conf < confidenceMin) return false;
      if (frameworkFilter === "AAMC" && !a.alignment.framework?.startsWith("AAMC"))
        return false;
      if (frameworkFilter === "USMLE" && a.alignment.framework !== "USMLE") return false;
      if (selectedChunkId && a.chunkId !== selectedChunkId) return false;
      return true;
    }) ?? [];

  const alignedFrameworkIds = new Set(
    filteredAlignments.map((a) => a.alignment.frameworkId),
  );

  const onApprove = useCallback(async (id: number, status: "approved" | "rejected") => {
    await fetch(`/api/alignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setDrawerAlignment((prev) => (prev ? { ...prev, status } : null));
  }, []);

  if (!data) {
    return (
      <div>
        <h1 className="font-heading text-2xl font-bold">Curriculum Map</h1>
        <p className="mt-4 text-rush-medium">
          Loading map data… Connect DATABASE_URL to load live alignments, or run seed +
          process-documents.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-bold">Curriculum Map</h1>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-white p-4">
        <label className="text-sm">
          Case{" "}
          <select
            className="ml-2 rounded border px-2 py-1"
            value={caseFilter}
            onChange={(e) => setCaseFilter(e.target.value)}
          >
            <option value="all">All</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={String(n)}>
                Case {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Framework{" "}
          <select
            className="ml-2 rounded border px-2 py-1"
            value={frameworkFilter}
            onChange={(e) => setFrameworkFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="AAMC">AAMC PCRS / EPA</option>
            <option value="USMLE">USMLE</option>
          </select>
        </label>
        <div className="min-w-[200px] flex-1">
          <p className="mb-1 text-xs">Confidence ≥ {confidenceMin.toFixed(1)}</p>
          <Slider
            min={0.5}
            max={1}
            step={0.05}
            value={[confidenceMin]}
            onValueChange={([v]) => setConfidenceMin(v)}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <CurriculumTree
          chunks={data.chunks}
          caseFilter={caseFilter}
          selectedChunkId={selectedChunkId}
          onSelect={setSelectedChunkId}
        />
        <FrameworkTree
          title="AAMC Standards"
          nodes={data.aamc.map((a) => ({
            id: a.subId ?? "",
            label: `${a.subId} — ${a.description?.slice(0, 40)}`,
          }))}
          alignedIds={alignedFrameworkIds}
          onSelectNode={(id) => {
            const hit = filteredAlignments.find((a) => a.alignment.frameworkId === id);
            if (hit) setDrawerAlignment(hit.alignment);
          }}
        />
        <FrameworkTree
          title="USMLE 2025"
          nodes={data.usmle.map((u) => ({
            id: u.domain ?? "",
            label: u.subdomain ? `${u.domain} — ${u.subdomain}` : u.domain ?? "",
          }))}
          alignedIds={alignedFrameworkIds}
          onSelectNode={(id) => {
            const hit = filteredAlignments.find((a) => a.alignment.frameworkId === id);
            if (hit) setDrawerAlignment(hit.alignment);
          }}
        />
      </div>

      <AlignmentDrawer
        alignment={drawerAlignment}
        excerpt={
          data.chunks.find((c) => c.chunk.id === drawerAlignment?.chunkId)?.chunk
            .content ?? ""
        }
        onClose={() => setDrawerAlignment(null)}
        onApprove={onApprove}
      />
    </div>
  );
}
