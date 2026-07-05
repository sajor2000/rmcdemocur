import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  access: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockRejectedValue(new Error("not found")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from("pdf-bytes")),
}));
vi.mock("fs/promises", () => ({ default: fsMocks }));

const blobPut = vi.hoisted(() => vi.fn().mockResolvedValue({ url: "https://example/blob" }));
vi.mock("@vercel/blob", () => ({ put: blobPut }));

const extractAnswerImages = vi.hoisted(() => vi.fn());
vi.mock("../../lib/pdf-figure-images", () => ({ extractAnswerImages }));

import { extractPdfMedia } from "@/scripts/extract-pdf-media";
import { FACULTY_GUIDES } from "@/scripts/curriculum-sources";

const pdfTargets = FACULTY_GUIDES.filter((f) => f.dest.endsWith(".pdf"));
const pdfCount = pdfTargets.length;
const firstPdf = pdfTargets[0]!.dest;

describe("extractPdfMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMocks.access.mockResolvedValue(undefined);
    fsMocks.mkdir.mockResolvedValue(undefined);
    fsMocks.stat.mockRejectedValue(new Error("not found"));
    fsMocks.writeFile.mockResolvedValue(undefined);
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
  });

  it("extracts answer images from every faculty PDF target", async () => {
    extractAnswerImages.mockResolvedValue([
      { answerImageOrdinal: 1, page: 5, bytes: Buffer.alloc(1000), ext: "png" },
      { answerImageOrdinal: 2, page: 8, bytes: Buffer.alloc(2000), ext: "png" },
    ]);

    const reports = await extractPdfMedia();

    expect(extractAnswerImages).toHaveBeenCalledTimes(pdfCount);
    const report = reports.find((r) => r.filename === firstPdf);
    expect(report?.extractedCount).toBe(2);
  });

  it("skips a missing PDF file without throwing", async () => {
    fsMocks.access.mockRejectedValue(new Error("ENOENT"));

    const reports = await extractPdfMedia();

    expect(extractAnswerImages).not.toHaveBeenCalled();
    expect(reports.every((r) => r.skippedReason === "missing-file")).toBe(true);
  });

  it("uploads to Blob with access:private when configured", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token";
    extractAnswerImages.mockResolvedValue([
      { answerImageOrdinal: 1, page: 5, bytes: Buffer.alloc(1000), ext: "png" },
    ]);

    await extractPdfMedia();

    expect(blobPut).toHaveBeenCalledTimes(pdfCount);
    const [, , options] = blobPut.mock.calls[0];
    expect(options).toMatchObject({ access: "private", allowOverwrite: true });
  });

  it("does not upload to Blob when not configured", async () => {
    extractAnswerImages.mockResolvedValue([
      { answerImageOrdinal: 1, page: 5, bytes: Buffer.alloc(1000), ext: "png" },
    ]);

    await extractPdfMedia();

    expect(blobPut).not.toHaveBeenCalled();
  });

  it("skips rewriting a file already on disk at the same size (idempotent)", async () => {
    extractAnswerImages.mockResolvedValue([
      { answerImageOrdinal: 1, page: 5, bytes: Buffer.alloc(1000), ext: "png" },
    ]);
    fsMocks.stat.mockResolvedValue({ size: 1000 });

    await extractPdfMedia();

    expect(fsMocks.writeFile).not.toHaveBeenCalled();
  });

  it("reports a Blob upload failure per-image without failing the whole run", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token";
    blobPut.mockRejectedValueOnce(new Error("network error"));
    extractAnswerImages.mockResolvedValue([
      { answerImageOrdinal: 1, page: 5, bytes: Buffer.alloc(1000), ext: "png" },
    ]);

    const reports = await extractPdfMedia();

    const report = reports.find((r) => r.filename === firstPdf);
    expect(report?.blobUploadErrors).toEqual([{ answerImageOrdinal: 1, error: "network error" }]);
  });
});
