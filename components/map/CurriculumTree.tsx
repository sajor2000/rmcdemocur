type ChunkRow = {
  chunk: { id: number; section: string | null; content: string };
  document: { caseNumber: number | null; caseTitle: string | null };
};

type Props = {
  chunks: ChunkRow[];
  caseFilter: string;
  selectedChunkId: number | null;
  onSelect: (id: number | null) => void;
};

export function CurriculumTree({
  chunks,
  caseFilter,
  selectedChunkId,
  onSelect,
}: Props) {
  const grouped = chunks.reduce<Record<string, ChunkRow[]>>((acc, row) => {
    const caseNum = row.document.caseNumber ?? 0;
    if (caseFilter !== "all" && String(caseNum) !== caseFilter) return acc;
    const key = `Case ${caseNum}: ${row.document.caseTitle ?? "Unknown"}`;
    acc[key] = acc[key] ?? [];
    acc[key].push(row);
    return acc;
  }, {});

  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-3 font-heading font-semibold">Rush Curriculum</h3>
      <ul className="max-h-[480px] space-y-2 overflow-y-auto text-sm">
        <li className="font-medium text-rush-green">RMD 563</li>
        {Object.entries(grouped).map(([caseLabel, rows]) => (
          <li key={caseLabel} className="ml-2">
            <p className="font-medium">{caseLabel}</p>
            <ul className="ml-3 mt-1 space-y-1">
              {Array.from(
                new Map(rows.map((r) => [r.chunk.section ?? "Section", r])).entries(),
              ).map(([section, row]) => (
                <li key={row.chunk.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onSelect(selectedChunkId === row.chunk.id ? null : row.chunk.id)
                    }
                    className={`text-left hover:text-rush-green ${
                      selectedChunkId === row.chunk.id
                        ? "font-semibold text-rush-green"
                        : ""
                    }`}
                  >
                    {section}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
