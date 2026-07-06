"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const initialCase = searchParams.get("case");
  const [data, setData] = useState<{
    documents: { id: number; caseNumber: number | null; caseTitle: string | null }[];
    chunks: { chunk: { id: number; section: string | null; content: string; documentId: number | null }; document: { caseNumber: number | null; caseTitle: string | null } }[];
    alignments: { alignment: Alignment; chunkId: number }[];
    objectivesByDocument?: Record<number, { code: string | null; text: string }[]>;
    mediaByChunkId?: Record<
      number,
      {
        id: number;
        label: string;
        textForEmbed: string | null;
        hasFile: boolean;
        hasCaptionInText: boolean | null;
        referenceKind: string;
      }[]
    >;
    keywordsByChunkId?: Record<
      number,
      { keyword: string; definition: string | null }[]
    >;
    aamc: { stableId: string | null; subId: string | null; domainName: string | null; description: string | null }[];
    usmle: { stableId: string | null; domain: string | null; subdomain: string | null }[];
  } | null>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<number | null>(null);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string | null>(null);
  const [caseFilter, setCaseFilter] = useState<string>(
    initialCase && initialCase !== "all" ? initialCase : "all",
  );
  const [frameworkFilter, setFrameworkFilter] = useState<string>("all");
  const [confidenceMin, setConfidenceMin] = useState(0.5);
  const [keywordFilter, setKeywordFilter] = useState<string>("all");
  const [drawerAlignment, setDrawerAlignment] = useState<Alignment | null>(null);

  useEffect(() => {
    fetch(`/api/courses/${params.courseId}/map`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [params.courseId]);

  // Alignments passing the filters (case/framework/confidence) — the pool the
  // map reasons over, independent of the current selection.
  const baseAlignments =
    (data?.alignments ?? []).filter((a) => {
      const conf = Number(a.alignment.confidence ?? 0);
      if (conf < confidenceMin) return false;
      if (frameworkFilter === "AAMC" && !a.alignment.framework?.startsWith("AAMC"))
        return false;
      if (frameworkFilter === "USMLE" && a.alignment.framework !== "USMLE") return false;
      return true;
    }) ?? [];

  const selectionActive = selectedChunkId != null || selectedFrameworkId != null;

  // Alignments the current selection links to: a chunk's alignments, a framework
  // node's alignments, or (no selection) the whole aligned overview.
  const linkedAlignments = selectedChunkId
    ? baseAlignments.filter((a) => a.chunkId === selectedChunkId)
    : selectedFrameworkId
      ? baseAlignments.filter((a) => a.alignment.frameworkId === selectedFrameworkId)
      : baseAlignments;

  const linkedFrameworkIds = new Set(
    linkedAlignments.map((a) => a.alignment.frameworkId),
  );
  const linkedChunkIds = new Set(linkedAlignments.map((a) => a.chunkId));

  // Distinct keywords across the course, sorted for the filter dropdown.
  const keywordOptions = Array.from(
    new Set(
      Object.values(data?.keywordsByChunkId ?? {}).flatMap((tags) =>
        tags.map((t) => t.keyword),
      ),
    ),
  ).sort((a, b) => a.localeCompare(b));

  // Chunks tagged with the selected keyword — undefined (no filter) shows all.
  const keywordChunkIds =
    keywordFilter === "all"
      ? undefined
      : new Set(
          Object.entries(data?.keywordsByChunkId ?? {})
            .filter(([, tags]) => tags.some((t) => t.keyword === keywordFilter))
            .map(([chunkId]) => Number(chunkId)),
        );

  // Framework nodes to highlight: everything aligned on no selection (overview),
  // else only the selection's links.
  const highlightFrameworkIds = selectionActive
    ? linkedFrameworkIds
    : new Set(baseAlignments.map((a) => a.alignment.frameworkId));

  const selectChunk = (id: number | null) => {
    setSelectedFrameworkId(null);
    setSelectedChunkId(id);
  };
  const selectFramework = (id: string) => {
    setSelectedChunkId(null);
    setSelectedFrameworkId((prev) => (prev === id ? null : id));
    const hit = baseAlignments.find((a) => a.alignment.frameworkId === id);
    if (hit) setDrawerAlignment(hit.alignment);
  };
  const clearSelection = () => {
    setSelectedChunkId(null);
    setSelectedFrameworkId(null);
  };

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
        <p className="mt-4 text-rush-medium">Loading the curriculum map…</p>
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
            {Array.from(
              new Set(
                data.documents
                  .map((d) => d.caseNumber)
                  .filter((n): n is number => n != null),
              ),
            )
              .sort((a, b) => a - b)
              .map((n) => (
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
        {keywordOptions.length > 0 && (
          <label className="text-sm">
            Keyword{" "}
            <select
              className="ml-2 rounded border px-2 py-1"
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
            >
              <option value="all">All</option>
              {keywordOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {selectionActive ? (
        <div className="flex items-center justify-between rounded-lg border border-rush-green/40 bg-green-50 px-4 py-2 text-sm">
          <span className="text-rush-dark">
            {selectedChunkId
              ? `Highlighting the ${linkedFrameworkIds.size} framework node(s) this curriculum item aligns to.`
              : `Highlighting the ${linkedChunkIds.size} curriculum item(s) aligned to this framework node.`}
          </span>
          <button
            type="button"
            onClick={clearSelection}
            className="font-medium text-rush-green hover:underline"
          >
            Clear selection
          </button>
        </div>
      ) : (
        <p className="text-sm text-rush-medium">
          Select a curriculum item to see the AAMC/USMLE nodes it aligns to — or a
          framework node to see the curriculum that covers it.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <CurriculumTree
          chunks={data.chunks}
          caseFilter={caseFilter}
          selectedChunkId={selectedChunkId}
          highlightChunkIds={selectedFrameworkId ? linkedChunkIds : undefined}
          keywordChunkIds={keywordChunkIds}
          dim={selectedFrameworkId != null}
          onSelect={selectChunk}
        />
        <FrameworkTree
          title="AAMC Standards"
          nodes={data.aamc.map((a) => ({
            id: a.stableId ?? "",
            label: `${a.subId} — ${a.description?.slice(0, 40)}`,
          }))}
          highlightIds={highlightFrameworkIds}
          selectedId={selectedFrameworkId}
          dim={selectionActive}
          onSelectNode={selectFramework}
        />
        <FrameworkTree
          title="USMLE 2025"
          nodes={data.usmle.map((u) => ({
            id: u.stableId ?? "",
            label: u.subdomain ? `${u.domain} — ${u.subdomain}` : u.domain ?? "",
          }))}
          highlightIds={highlightFrameworkIds}
          selectedId={selectedFrameworkId}
          dim={selectionActive}
          onSelectNode={selectFramework}
        />
      </div>

      <AlignmentDrawer
        alignment={drawerAlignment}
        excerpt={
          data.chunks.find((c) => c.chunk.id === drawerAlignment?.chunkId)?.chunk
            .content ?? ""
        }
        linkedMedia={
          drawerAlignment?.chunkId
            ? data.mediaByChunkId?.[drawerAlignment.chunkId] ?? []
            : []
        }
        keywords={
          drawerAlignment?.chunkId
            ? data.keywordsByChunkId?.[drawerAlignment.chunkId] ?? []
            : []
        }
        objectives={(() => {
          const docId = data.chunks.find(
            (c) => c.chunk.id === drawerAlignment?.chunkId,
          )?.chunk.documentId;
          return docId != null ? data.objectivesByDocument?.[docId] ?? [] : [];
        })()}
        onClose={() => setDrawerAlignment(null)}
        onApprove={onApprove}
      />
    </div>
  );
}
