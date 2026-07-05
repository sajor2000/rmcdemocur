import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const selectWhere = vi.fn<() => Promise<Record<string, unknown>[]>>(() => Promise.resolve([]));
  const innerJoin = vi.fn(() => ({ where: selectWhere }));
  const selectFrom = vi.fn(() => ({ innerJoin }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const updateWhere = vi.fn(() => Promise.resolve(undefined));
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));
  return { select, selectFrom, innerJoin, selectWhere, update, set, updateWhere };
});
vi.mock("@/lib/db", () => ({ getDb: () => dbMocks }));

const resolveMediaKeyPath = vi.hoisted(() =>
  vi.fn<(key: string) => string | null>((key: string) => `/media-root/${key}`),
);
vi.mock("@/lib/media-storage", () => ({ resolveMediaKeyPath }));

const describeFigureImage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vision-caption", () => ({ describeFigureImage }));

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
}));
vi.mock("fs/promises", () => ({ default: fsMocks }));

vi.mock("../../scripts/load-env", () => ({}));

import { describeFigureImages } from "@/scripts/describe-figure-images";

describe("describeFigureImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMocks.readFile.mockResolvedValue(Buffer.from([1, 2, 3]));
    resolveMediaKeyPath.mockImplementation((key: string) => `/media-root/${key}`);
  });

  it("writes a vision caption for each candidate row", async () => {
    dbMocks.selectWhere.mockResolvedValueOnce([
      { id: 1, label: "Answer Image", storagePath: "1/doc/1.png", referenceKind: "answer_image", filename: "f.pdf" },
    ]);
    describeFigureImage.mockResolvedValueOnce("A caption.");

    const summary = await describeFigureImages();

    expect(summary.candidates).toBe(1);
    expect(summary.described).toBe(1);
    expect(dbMocks.set).toHaveBeenCalledWith({ textForEmbed: "A caption.", captionSource: "vision" });
  });

  it("skips writing when the model reports no describable content", async () => {
    dbMocks.selectWhere.mockResolvedValueOnce([
      { id: 1, label: "Answer Image", storagePath: "1/doc/1.png", referenceKind: "answer_image", filename: "f.pdf" },
    ]);
    describeFigureImage.mockResolvedValueOnce(null);

    const summary = await describeFigureImages();

    expect(summary.described).toBe(0);
    expect(summary.skippedNoContent).toBe(1);
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("refuses to process anything when candidates exceed the cap (no partial batch)", async () => {
    const manyRows = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      label: "Answer Image",
      storagePath: `1/doc/${i + 1}.png`,
      referenceKind: "answer_image",
      filename: "f.pdf",
    }));
    dbMocks.selectWhere.mockResolvedValueOnce(manyRows);

    await expect(describeFigureImages({ maxImages: 3 })).rejects.toThrow(/exceed the cap/);

    expect(describeFigureImage).not.toHaveBeenCalled();
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("records a per-row error without stopping the rest of the batch", async () => {
    dbMocks.selectWhere.mockResolvedValueOnce([
      { id: 1, label: "A", storagePath: "1/doc/1.png", referenceKind: "answer_image", filename: "f.pdf" },
      { id: 2, label: "B", storagePath: "1/doc/2.png", referenceKind: "answer_image", filename: "f.pdf" },
    ]);
    describeFigureImage.mockRejectedValueOnce(new Error("vision API error")).mockResolvedValueOnce("ok caption");

    const summary = await describeFigureImages();

    expect(summary.errors).toEqual([{ mediaAssetId: 1, error: "vision API error" }]);
    expect(summary.described).toBe(1);
  });

  it("treats a storage_path resolving outside MEDIA_ROOT as a per-row error, not a crash", async () => {
    dbMocks.selectWhere.mockResolvedValueOnce([
      { id: 1, label: "A", storagePath: "../escape", referenceKind: "answer_image", filename: "f.pdf" },
    ]);
    resolveMediaKeyPath.mockReturnValueOnce(null);

    const summary = await describeFigureImages();

    expect(summary.errors[0]).toMatchObject({ mediaAssetId: 1 });
    expect(describeFigureImage).not.toHaveBeenCalled();
  });
});
