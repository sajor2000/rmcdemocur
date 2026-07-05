import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  access: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockRejectedValue(new Error("not found")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from("docx-bytes")),
}));
vi.mock("fs/promises", () => ({ default: fsMocks }));

const blobPut = vi.hoisted(() => vi.fn().mockResolvedValue({ url: "https://example/blob" }));
vi.mock("@vercel/blob", () => ({ put: blobPut }));

vi.mock("../../lib/document-parser", () => ({ parseDocument: vi.fn() }));

const extractLabeledFigureImages = vi.hoisted(() => vi.fn());
vi.mock("../../lib/docx-figure-images", () => ({ extractLabeledFigureImages }));

import { extractDocxMedia } from "@/scripts/extract-docx-media";
import { SELF_STUDY_GUIDES } from "@/scripts/curriculum-sources";

const selfStudyCount = SELF_STUDY_GUIDES.length;
const firstSelfStudyDoc = SELF_STUDY_GUIDES[0]!.dest;

describe("extractDocxMedia self-study (labeled figures only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMocks.access.mockResolvedValue(undefined);
    fsMocks.mkdir.mockResolvedValue(undefined);
    fsMocks.stat.mockRejectedValue(new Error("not found"));
    fsMocks.writeFile.mockResolvedValue(undefined);
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
  });

  it("extracts only labeled figures via extractLabeledFigureImages, not the raw zip loop", async () => {
    extractLabeledFigureImages.mockResolvedValue([
      { figureOrdinal: 1, label: "Figure 1", bytes: Buffer.alloc(5000), ext: "png" },
      { figureOrdinal: 3, label: "Figure 3", bytes: Buffer.alloc(6000), ext: "jpg" },
    ]);

    const reports = await extractDocxMedia({ scope: "self_study" });

    expect(extractLabeledFigureImages).toHaveBeenCalledTimes(selfStudyCount);
    const report = reports.find((r) => r.filename === firstSelfStudyDoc);
    expect(report?.extractedCount).toBe(2);
    expect(fsMocks.writeFile).toHaveBeenCalled();
  });

  it("never uploads self-study figures to Blob, even when Blob is configured", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token";
    extractLabeledFigureImages.mockResolvedValue([
      { figureOrdinal: 1, label: "Figure 1", bytes: Buffer.alloc(5000), ext: "png" },
    ]);

    await extractDocxMedia({ scope: "self_study" });

    expect(blobPut).not.toHaveBeenCalled();
  });

  it("skips rewriting a figure image already on disk at the same size (idempotent)", async () => {
    extractLabeledFigureImages.mockResolvedValue([
      { figureOrdinal: 1, label: "Figure 1", bytes: Buffer.alloc(5000), ext: "png" },
    ]);
    fsMocks.stat.mockResolvedValue({ size: 5000 });

    const reports = await extractDocxMedia({ scope: "self_study" });

    expect(fsMocks.writeFile).not.toHaveBeenCalled();
    const report = reports.find((r) => r.filename === firstSelfStudyDoc);
    expect(report?.extractedCount).toBe(1);
  });

  it("re-extracts a figure image when the on-disk size differs from the resolved bytes", async () => {
    extractLabeledFigureImages.mockResolvedValue([
      { figureOrdinal: 1, label: "Figure 1", bytes: Buffer.alloc(5000), ext: "png" },
    ]);
    fsMocks.stat.mockResolvedValue({ size: 999 });

    await extractDocxMedia({ scope: "self_study" });

    expect(fsMocks.writeFile).toHaveBeenCalled();
  });
});
