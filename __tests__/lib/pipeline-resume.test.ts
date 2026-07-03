import { beforeEach, describe, expect, it, vi } from "vitest";

const generateEmbedding = vi.hoisted(() => vi.fn().mockResolvedValue([0.1, 0.2, 0.3]));
const alignToFramework = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const retrieveKeywordCandidates = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const parseDocument = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ text: "Rationale:\nShort rationale content for embedding." }),
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
vi.mock("@/lib/media-pipeline", () => ({
  clearDocumentMedia: vi.fn().mockResolvedValue(undefined),
  upsertDocumentMediaAssets: vi.fn().mockResolvedValue([]),
  linkDocumentMediaToChunks: vi.fn().mockResolvedValue({ assets: [], links: [] }),
  buildEmbedTextForChunk: (_content: string, embedText: string) => embedText,
  linkedMediaIdsForChunk: () => new Set<number>(),
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

import { runFullPipeline, chunksMatchExisting } from "@/lib/pipeline";
import { buildChunksFromDocument } from "@/lib/chunker";

describe("chunksMatchExisting", () => {
  it("matches when index and content align", () => {
    const built = [
      { chunkIndex: 0, content: "a" },
      { chunkIndex: 1, content: "b" },
    ];
    const existing = [
      { chunkIndex: 1, content: "b" },
      { chunkIndex: 0, content: "a" },
    ];
    expect(chunksMatchExisting(built, existing)).toBe(true);
  });

  it("rejects a count mismatch", () => {
    expect(
      chunksMatchExisting([{ chunkIndex: 0, content: "a" }], [
        { chunkIndex: 0, content: "a" },
        { chunkIndex: 1, content: "b" },
      ]),
    ).toBe(false);
  });

  it("rejects a content mismatch (chunker or source changed)", () => {
    expect(
      chunksMatchExisting([{ chunkIndex: 0, content: "a" }], [{ chunkIndex: 0, content: "A" }]),
    ).toBe(false);
  });

  it("rejects an empty built set", () => {
    expect(chunksMatchExisting([], [])).toBe(false);
  });
});

describe("runFullPipeline resume", () => {
  const text = "Rationale:\nShort rationale content for embedding.";
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
  });

  it("reuses matching chunks and skips embedding + alignment already done", async () => {
    // select() order on resume: docMeta → resume-probe → courseId → alignCount
    dbMocks.setSelectQueue([
      [{ caseTitle: "Marie Hernandez", filename: "f.docx", caseNumber: 3 }],
      existingRows,
      [{ courseId: 1 }],
      [{ count: built.length }],
    ]);
    // execute() order on resume: countObjectives → aligned set → tagged set → gaps
    dbMocks.execute
      .mockResolvedValueOnce({ rows: [{ n: 1 }] })
      .mockResolvedValueOnce({ rows: chunkIdRows })
      .mockResolvedValueOnce({ rows: chunkIdRows })
      .mockResolvedValue({ rows: [] });

    await runFullPipeline({ documentId: 10, filePath: "/tmp/fake.docx" });

    // Everything for this document was already done — nothing re-paid.
    expect(generateEmbedding).not.toHaveBeenCalled();
    expect(alignToFramework).not.toHaveBeenCalled();
    expect(retrieveKeywordCandidates).not.toHaveBeenCalled();
    // No new chunk rows, objectives, alignments, or tags inserted.
    expect(dbMocks.insert).not.toHaveBeenCalled();
    // Objectives were not re-extracted (existing count > 0).
    expect(extractAndCleanObjectives).not.toHaveBeenCalled();
  });
});
