import { beforeEach, describe, expect, it, vi } from "vitest";

const generateEmbedding = vi.hoisted(() => vi.fn().mockResolvedValue([0.1, 0.2, 0.3]));
const parseDocument = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ text: "Rationale:\nShort rationale content for embedding." }),
);
const extractAndCleanObjectives = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ objectives: [], sectionsFound: 0, llmUsed: false }),
);

vi.mock("@/lib/azure-ai", () => ({
  generateEmbedding,
  alignToFramework: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/document-parser", () => ({ parseDocument }));
vi.mock("@/lib/objective-cleanup", () => ({ extractAndCleanObjectives }));
vi.mock("@/lib/framework-rag", () => ({
  retrieveKeywordCandidates: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/media-pipeline", () => ({
  clearDocumentMedia: vi.fn().mockResolvedValue(undefined),
  upsertDocumentMediaAssets: vi.fn().mockResolvedValue([]),
  linkDocumentMediaToChunks: vi.fn().mockResolvedValue({ assets: [], links: [] }),
  buildEmbedTextForChunk: (_content: string, embedText: string) => embedText,
  linkedMediaIdsForChunk: () => new Set<number>(),
}));

const dbMocks = vi.hoisted(() => {
  // Order matches runFullPipeline's select() sequence on a fresh run:
  // docMeta → resume-probe (existing chunks, empty) → per-chunk align select
  // → alignment count.
  let selectQueue: unknown[][] = [
    [{ caseTitle: "Marie Hernandez", filename: "RMD563_FacultyGuide_Case3_MarieHernandez.docx", caseNumber: 3 }],
    [],
    [{ id: 1, chunkIndex: 0, section: "Rationale:", content: "Short rationale content for embedding.", embedding: [0.1] }],
    [{ count: 0 }],
  ];
  let selectIndex = 0;

  const returning = vi.fn(() => [{ id: 1 }]);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));

  const makeThenable = (batch: unknown[]) => ({
    limit: vi.fn(() => Promise.resolve(batch)),
    then(
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
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

  const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  const update = vi.fn(() => ({ set: updateSet }));
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));

  return {
    select,
    insert,
    delete: deleteFn,
    update,
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    reset() {
      selectIndex = 0;
      selectQueue = [
        [{ caseTitle: "Marie Hernandez", filename: "RMD563_FacultyGuide_Case3_MarieHernandez.docx", caseNumber: 3 }],
        [],
        [{ id: 1, chunkIndex: 0, section: "Rationale:", content: "Short rationale content for embedding.", embedding: [0.1] }],
        [{ count: 0 }],
      ];
      vi.clearAllMocks();
      insert.mockReturnValue({ values });
      values.mockReturnValue({ returning });
      returning.mockReturnValue([{ id: 1 }]);
    },
  };
});

vi.mock("@/lib/db", () => ({
  getDb: () => dbMocks,
}));

import { runFullPipeline } from "@/lib/pipeline";

describe("runFullPipeline embedding input", () => {
  beforeEach(() => {
    dbMocks.reset();
    generateEmbedding.mockClear();
    parseDocument.mockClear();
  });

  it("embeds breadcrumbed embedText while persisting raw chunk content", async () => {
    await runFullPipeline({
      documentId: 10,
      filePath: "/tmp/fake.docx",
    });

    expect(generateEmbedding).toHaveBeenCalled();
    const embedArg = generateEmbedding.mock.calls[0]?.[0] as string;
    expect(embedArg.startsWith("Marie Hernandez › Rationale:")).toBe(true);
    expect(embedArg).toContain("Short rationale content for embedding.");
    expect(dbMocks.insert).toHaveBeenCalled();
  });
});
