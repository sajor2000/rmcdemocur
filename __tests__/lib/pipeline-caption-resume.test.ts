import { beforeEach, describe, expect, it, vi } from "vitest";

const generateEmbedding = vi.hoisted(() => vi.fn().mockResolvedValue([0.1, 0.2, 0.3]));
const alignToFramework = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const retrieveKeywordCandidates = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const parseDocument = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ text: "Figure 1: a cirrhotic liver." }),
);
const extractAndCleanObjectives = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ objectives: [], sectionsFound: 0, llmUsed: false }),
);

vi.mock("@/lib/azure-ai", () => ({ generateEmbedding, alignToFramework }));
vi.mock("@/lib/document-parser", () => ({ parseDocument }));
vi.mock("@/lib/objective-cleanup", () => ({ extractAndCleanObjectives }));
vi.mock("@/lib/framework-rag", () => ({ retrieveKeywordCandidates }));
vi.mock("@/lib/gap-analyzer", () => ({
  recomputeCourseFrameworkGaps: vi.fn(),
  recomputeGapSummary: vi.fn(),
  deriveCoverageStatus: vi.fn(() => "covered"),
}));

// One linked media asset, csv-captioned, on chunk id 101 — the resume path
// must still re-embed that chunk even though its content is unchanged.
const linkDocumentMediaToChunks = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    assets: [{ id: 1, label: "Figure 1", textForEmbed: "Corrected caption.", referenceKind: "figure", captionSource: "csv" }],
    links: [{ chunkId: 101, mediaAssetId: 1 }],
  }),
);
vi.mock("@/lib/media-pipeline", () => ({
  clearDocumentMedia: vi.fn().mockResolvedValue(undefined),
  upsertDocumentMediaAssets: vi.fn().mockResolvedValue([]),
  linkDocumentMediaToChunks,
  buildEmbedTextForChunk: (_content: string, embedText: string) => embedText,
  linkedMediaIdsForChunk: (chunkId: number, links: { chunkId: number; mediaAssetId: number }[]) =>
    new Set(links.filter((l) => l.chunkId === chunkId).map((l) => l.mediaAssetId)),
}));

const dbMocks = vi.hoisted(() => {
  let selectQueue: unknown[][] = [];
  let selectIndex = 0;
  const returning = vi.fn(() => [{ id: 1 }]);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  const makeThenable = (batch: unknown[]) => ({
    limit: vi.fn(() => Promise.resolve(batch)),
    then(onFulfilled?: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) {
      return Promise.resolve(batch).then(onFulfilled, onRejected);
    },
  });
  const from = vi.fn(() => {
    const batch = selectQueue[selectIndex++] ?? [];
    const chain = makeThenable(batch);
    return {
      where: vi.fn(() => chain),
      innerJoin: vi.fn(() => ({ where: vi.fn(() => chain) })),
    };
  });
  const select = vi.fn(() => ({ from }));
  const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) }));
  const deleteFn = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  const execute = vi.fn().mockResolvedValue({ rows: [] });
  return {
    select,
    insert,
    delete: deleteFn,
    update,
    execute,
    setSelectQueue(q: unknown[][]) {
      selectQueue = q;
      selectIndex = 0;
    },
    reset() {
      selectIndex = 0;
      selectQueue = [];
      vi.clearAllMocks();
      insert.mockReturnValue({ values });
      values.mockReturnValue({ returning });
      returning.mockReturnValue([{ id: 1 }]);
      execute.mockResolvedValue({ rows: [] });
    },
  };
});

vi.mock("@/lib/db", () => ({ getDb: () => dbMocks }));

import { runFullPipeline } from "@/lib/pipeline";
import { buildChunksFromDocument } from "@/lib/chunker";

describe("runFullPipeline resume — caption-aware re-embed", () => {
  const text = "Figure 1: a cirrhotic liver.";
  const built = buildChunksFromDocument(text, "Marie Hernandez");
  const existingRows = built.map((b, i) => ({
    id: 101 + i,
    chunkIndex: b.chunkIndex,
    content: b.content,
    section: b.section,
    embedding: [0.1, 0.2, 0.3],
  }));
  const chunkIdRows = existingRows.map((r) => ({ chunk_id: r.id }));

  beforeEach(() => {
    dbMocks.reset();
    linkDocumentMediaToChunks.mockResolvedValue({
      assets: [
        {
          id: 1,
          label: "Figure 1",
          textForEmbed: "Corrected caption.",
          referenceKind: "figure",
          captionSource: "csv",
        },
      ],
      links: [{ chunkId: existingRows[0].id, mediaAssetId: 1 }],
    });
  });

  it("re-embeds a resumed chunk linked to a CSV-corrected caption instead of carrying over the stale embedding", async () => {
    dbMocks.setSelectQueue([
      [{ caseTitle: "Marie Hernandez", filename: "f.docx", caseNumber: 3 }],
      existingRows,
      [{ courseId: 1 }],
      [{ count: built.length }],
    ]);
    dbMocks.execute
      .mockResolvedValueOnce({ rows: [{ n: 1 }] }) // existing objective count > 0, skip re-extraction
      .mockResolvedValueOnce({ rows: chunkIdRows }) // aligned set (all, so aligning is skipped too)
      .mockResolvedValueOnce({ rows: chunkIdRows }) // tagged set
      .mockResolvedValue({ rows: [] });

    await runFullPipeline({ documentId: 10, filePath: "/tmp/fake.docx" });

    // The chunk linked to the csv-captioned asset must be re-embedded even
    // though it resumed (its content and stored embedding were unchanged).
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
  });

  it("does not re-embed a resumed chunk with no csv-captioned media link", async () => {
    linkDocumentMediaToChunks.mockResolvedValue({ assets: [], links: [] });
    dbMocks.setSelectQueue([
      [{ caseTitle: "Marie Hernandez", filename: "f.docx", caseNumber: 3 }],
      existingRows,
      [{ courseId: 1 }],
      [{ count: built.length }],
    ]);
    dbMocks.execute
      .mockResolvedValueOnce({ rows: [{ n: 1 }] })
      .mockResolvedValueOnce({ rows: chunkIdRows })
      .mockResolvedValueOnce({ rows: chunkIdRows })
      .mockResolvedValue({ rows: [] });

    await runFullPipeline({ documentId: 10, filePath: "/tmp/fake.docx" });

    expect(generateEmbedding).not.toHaveBeenCalled();
  });
});
