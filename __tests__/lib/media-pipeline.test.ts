import { beforeEach, describe, expect, it, vi } from "vitest";

const listExtractedMediaFiles = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/lib/media-storage", () => ({ listExtractedMediaFiles }));

const dbMocks = vi.hoisted(() => {
  const selectWhere = vi.fn<() => Promise<Record<string, unknown>[]>>(() => Promise.resolve([]));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const execute = vi.fn<(query: unknown) => Promise<{ rows: Record<string, unknown>[] }>>(() =>
    Promise.resolve({ rows: [] }),
  );
  const deleteWhere = vi.fn(() => Promise.resolve(undefined));
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));
  return { select, selectFrom, selectWhere, execute, delete: deleteFn, deleteWhere };
});

vi.mock("@/lib/db", () => ({ getDb: () => dbMocks }));

import {
  assignFacultyAnswerImageStoragePaths,
  buildEmbedTextForChunk,
  clearDocumentMedia,
  linkedMediaIdsForChunk,
  upsertDocumentMediaAssets,
} from "@/lib/media-pipeline";
import type { FigureRegistryEntry } from "@/lib/media-types";

describe("assignFacultyAnswerImageStoragePaths", () => {
  it("maps answer images to the last N extracted files in document order", () => {
    const registry: FigureRegistryEntry[] = [
      {
        label: "Answer Image 1A",
        referenceKind: "answer_image",
        section: null,
        lineIndex: 10,
        hasCaptionInText: true,
        textForEmbed: "Caption one",
        extractionScope: "faculty",
        sourceIndex: 1,
        type: "figure",
      },
      {
        label: "Answer Image 2",
        referenceKind: "answer_image",
        section: null,
        lineIndex: 20,
        hasCaptionInText: true,
        textForEmbed: "Caption two",
        extractionScope: "faculty",
        sourceIndex: 2,
        type: "figure",
      },
    ];
    const extracted = [
      { sourceIndex: 1, storagePath: "/tmp/media/1.png" },
      { sourceIndex: 2, storagePath: "/tmp/media/2.png" },
      { sourceIndex: 3, storagePath: "/tmp/media/3.png" },
      { sourceIndex: 4, storagePath: "/tmp/media/4.png" },
    ];

    const map = assignFacultyAnswerImageStoragePaths(registry, extracted);
    expect(map.get(10)).toBe("/tmp/media/3.png");
    expect(map.get(20)).toBe("/tmp/media/4.png");
  });

  it("enriches embed text only for linked faculty media ids", () => {
    const assets = [
      {
        id: 1,
        label: "Answer Image 1A",
        textForEmbed: "Cirrhosis caption.",
        referenceKind: "answer_image",
      },
      {
        id: 2,
        label: "Figure 2A",
        textForEmbed: "Histology caption.",
        referenceKind: "figure",
      },
    ];
    const linkedIds = linkedMediaIdsForChunk(10, [{ chunkId: 10, mediaAssetId: 1 }]);
    const enriched = buildEmbedTextForChunk(
      "Answer Image 1A appears here.",
      "Case › Section › body",
      assets,
      linkedIds,
    );
    expect(enriched).toContain("Cirrhosis caption.");
    expect(enriched).not.toContain("Histology caption.");
  });
});

describe("upsertDocumentMediaAssets", () => {
  const singleFigureText =
    "Figure 1: A cirrhotic liver with nodular surface and irregular contour.";

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.select.mockReturnValue({ from: dbMocks.selectFrom });
    dbMocks.selectFrom.mockReturnValue({ where: dbMocks.selectWhere });
    dbMocks.selectWhere.mockResolvedValue([]);
    dbMocks.execute.mockResolvedValue({ rows: [] });
    dbMocks.delete.mockReturnValue({ where: dbMocks.deleteWhere });
    dbMocks.deleteWhere.mockResolvedValue(undefined);
    listExtractedMediaFiles.mockResolvedValue([]);
  });

  it("upserts each registry entry via ON CONFLICT and returns the row set", async () => {
    dbMocks.selectWhere.mockResolvedValueOnce([]); // existingRows: none yet
    dbMocks.execute.mockResolvedValueOnce({
      rows: [{ id: 1, label: "Figure 1", textForEmbed: null, referenceKind: "figure" }],
    });

    const result = await upsertDocumentMediaAssets({
      documentId: 10,
      filename: "f.docx",
      fileType: "docx",
      caseNumber: 3,
      text: singleFigureText,
    });

    expect(dbMocks.execute).toHaveBeenCalledTimes(1);
    const [query] = dbMocks.execute.mock.calls[0] as [{ queryChunks: unknown }];
    const queryText = JSON.stringify(query.queryChunks);
    expect(queryText).toContain("ON CONFLICT (document_id, label, reference_kind, (COALESCE(source_index, -1)))");
    expect(result).toEqual([{ id: 1, label: "Figure 1", textForEmbed: null, referenceKind: "figure" }]);
    // No existing rows to reconcile against — no vanished-key delete.
    expect(dbMocks.delete).not.toHaveBeenCalled();
  });

  it("deletes a media row (and its chunk_media links first) when its key vanishes from the registry", async () => {
    dbMocks.selectWhere.mockResolvedValueOnce([
      { id: 55, label: "Figure 2", referenceKind: "figure", sourceIndex: null },
    ]);
    dbMocks.execute.mockResolvedValueOnce({
      rows: [{ id: 1, label: "Figure 1", textForEmbed: null, referenceKind: "figure" }],
    });

    await upsertDocumentMediaAssets({
      documentId: 10,
      filename: "f.docx",
      fileType: "docx",
      caseNumber: 3,
      text: singleFigureText,
    });

    // Two deletes: chunk_media links first, then the media_assets row.
    expect(dbMocks.delete).toHaveBeenCalledTimes(2);
  });

  it("does not delete a media row whose key still matches the registry", async () => {
    dbMocks.selectWhere.mockResolvedValueOnce([
      { id: 1, label: "Figure 1", referenceKind: "figure", sourceIndex: null },
    ]);
    dbMocks.execute.mockResolvedValueOnce({
      rows: [{ id: 1, label: "Figure 1", textForEmbed: null, referenceKind: "figure" }],
    });

    await upsertDocumentMediaAssets({
      documentId: 10,
      filename: "f.docx",
      fileType: "docx",
      caseNumber: 3,
      text: singleFigureText,
    });

    expect(dbMocks.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete existing rows when the freshly-parsed registry is empty", async () => {
    dbMocks.selectWhere.mockResolvedValueOnce([
      { id: 1, label: "Figure 1", referenceKind: "figure", sourceIndex: null },
    ]);

    await expect(
      upsertDocumentMediaAssets({
        documentId: 10,
        filename: "f.docx",
        fileType: "docx",
        caseNumber: 3,
        text: "No figures mentioned anywhere in this document.",
      }),
    ).rejects.toThrow(/refusing to delete/);

    expect(dbMocks.execute).not.toHaveBeenCalled();
    expect(dbMocks.delete).not.toHaveBeenCalled();
  });
});

describe("clearDocumentMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.select.mockReturnValue({ from: dbMocks.selectFrom });
    dbMocks.selectFrom.mockReturnValue({ where: dbMocks.selectWhere });
    dbMocks.delete.mockReturnValue({ where: dbMocks.deleteWhere });
    dbMocks.deleteWhere.mockResolvedValue(undefined);
  });

  it("clears chunk_media links only — media_assets rows are left for the keyed upsert to manage", async () => {
    dbMocks.selectWhere.mockResolvedValueOnce([{ id: 7 }, { id: 8 }]);

    await clearDocumentMedia(42);

    // One delete per asset's chunk_media links, and nothing else.
    expect(dbMocks.delete).toHaveBeenCalledTimes(2);
  });
});
