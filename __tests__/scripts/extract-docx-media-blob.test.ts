import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeExecFileAsync = vi.hoisted(() => vi.fn());
vi.mock("util", async (importOriginal) => {
  const actual = await importOriginal<typeof import("util")>();
  return { ...actual, promisify: () => fakeExecFileAsync };
});

const fsMocks = vi.hoisted(() => ({
  access: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockRejectedValue(new Error("not found")), // force fresh extraction every time
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
}));
vi.mock("fs/promises", () => ({ default: fsMocks }));

const blobPut = vi.hoisted(() => vi.fn().mockResolvedValue({ url: "https://example/blob" }));
vi.mock("@vercel/blob", () => ({ put: blobPut }));

vi.mock("../../lib/document-parser", () => ({ parseDocument: vi.fn() }));

import { extractDocxMedia } from "@/scripts/extract-docx-media";
import { FACULTY_GUIDES } from "@/scripts/curriculum-sources";

const facultyDocxTargets = FACULTY_GUIDES.filter((f) => f.dest.endsWith(".docx"));
const facultyDocx = facultyDocxTargets[0]!.dest;
const facultyCount = facultyDocxTargets.length;

function mockUnzipCalls(entries: string[]) {
  fakeExecFileAsync.mockImplementation((_cmd: string, args: string[]) => {
    if (args.includes("-Z1")) {
      return Promise.resolve({ stdout: entries.join("\n") + "\n" });
    }
    // "-p" extraction call — return fake image bytes for whichever entry was requested.
    return Promise.resolve({ stdout: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
  });
}

describe("extractDocxMedia Blob upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMocks.access.mockResolvedValue(undefined);
    fsMocks.mkdir.mockResolvedValue(undefined);
    fsMocks.stat.mockRejectedValue(new Error("not found"));
    fsMocks.writeFile.mockResolvedValue(undefined);
    fsMocks.readFile.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    blobPut.mockResolvedValue({ url: "https://example/blob" });
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
  });

  it("does not attempt a Blob upload when no Blob credentials are configured", async () => {
    mockUnzipCalls(["word/media/image1.png"]);

    const reports = await extractDocxMedia({ scope: "faculty" });

    expect(blobPut).not.toHaveBeenCalled();
    const report = reports.find((r) => r.filename === facultyDocx);
    expect(report?.extractedCount).toBe(1);
    expect(report?.blobUploadErrors).toBeUndefined();
    // Local write still happens regardless of Blob configuration.
    expect(fsMocks.writeFile).toHaveBeenCalledTimes(facultyCount);
  });

  it("uploads to Blob with access:private when configured, alongside the local write", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token";
    mockUnzipCalls(["word/media/image1.png"]);

    await extractDocxMedia({ scope: "faculty" });

    // One entry per faculty DOCX target (each mocked to expose one media entry).
    expect(blobPut).toHaveBeenCalledTimes(facultyCount);
    const [, , options] = blobPut.mock.calls[0];
    expect(options).toMatchObject({ access: "private", allowOverwrite: true });
    expect(fsMocks.writeFile).toHaveBeenCalledTimes(facultyCount);
  });

  it("still uploads to Blob when local extraction is already cached (dev-then-deploy sequence)", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token";
    // Simulate an already-extracted, up-to-date local file: fs.stat resolves
    // for both the cached media file and the source docx, with the cached
    // file newer than the docx.
    fsMocks.stat.mockImplementation((p: string) => {
      if (p.endsWith(".docx")) return Promise.resolve({ mtimeMs: 1000 });
      return Promise.resolve({ size: 4, mtimeMs: 2000 });
    });
    mockUnzipCalls(["word/media/image1.png"]);

    const reports = await extractDocxMedia({ scope: "faculty" });

    // Cached, so no re-extraction or re-write of the local file...
    expect(fsMocks.writeFile).not.toHaveBeenCalled();
    // ...but the upload must still happen, reading bytes back from disk.
    expect(fsMocks.readFile).toHaveBeenCalledTimes(facultyCount);
    expect(blobPut).toHaveBeenCalledTimes(facultyCount);
    const report = reports.find((r) => r.filename === facultyDocx);
    expect(report?.extractedCount).toBe(1);
    expect(report?.blobUploadErrors).toBeUndefined();
  });

  it("reports a Blob upload failure per-file without corrupting the local write", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token";
    blobPut.mockRejectedValueOnce(new Error("network error"));
    mockUnzipCalls(["word/media/image1.png"]);

    const reports = await extractDocxMedia({ scope: "faculty" });

    // The first faculty target hits the rejected-once mock; its local write
    // still succeeded before the (failed) upload attempt.
    const report = reports.find((r) => r.filename === facultyDocx);
    expect(report?.extractedCount).toBe(1);
    expect(report?.blobUploadErrors).toEqual([{ sourceIndex: 1, error: "network error" }]);
    expect(fsMocks.writeFile).toHaveBeenCalledTimes(facultyCount);
  });
});
