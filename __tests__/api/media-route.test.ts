import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const limit = vi.fn<() => Promise<Record<string, unknown>[]>>(() => Promise.resolve([]));
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, limit };
});
vi.mock("@/lib/db", () => ({ getDb: () => dbMocks }));

const blobGet = vi.hoisted(() => vi.fn());
vi.mock("@vercel/blob", () => ({ get: blobGet }));

const fsMocks = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("fs/promises", () => ({ default: fsMocks }));

import { GET } from "@/app/api/media/[assetId]/route";

function fakeRequest(headers: Record<string, string> = {}): Request {
  return { headers: new Headers(headers) } as unknown as Request;
}

describe("GET /api/media/[assetId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
  });

  it("404s with a distinct message when the asset id is unknown", async () => {
    dbMocks.limit.mockResolvedValueOnce([]);

    const res = await GET(fakeRequest(), { params: { assetId: "999" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/asset not found/i);
    expect(blobGet).not.toHaveBeenCalled();
  });

  it("404s with a distinct message when the asset has no storage_path", async () => {
    dbMocks.limit.mockResolvedValueOnce([{ id: 1, storagePath: null }]);

    const res = await GET(fakeRequest(), { params: { assetId: "1" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no associated file/i);
  });

  it("serves from disk when no Blob credentials are configured", async () => {
    dbMocks.limit.mockResolvedValueOnce([{ id: 1, storagePath: "4/doc/1.png" }]);
    fsMocks.readFile.mockResolvedValueOnce(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const res = await GET(fakeRequest(), { params: { assetId: "1" } });

    expect(res.status).toBe(200);
    expect(blobGet).not.toHaveBeenCalled();
    expect(fsMocks.readFile).toHaveBeenCalledTimes(1);
  });

  it("404s distinctly when the fs driver's file is missing on disk", async () => {
    dbMocks.limit.mockResolvedValueOnce([{ id: 1, storagePath: "4/doc/1.png" }]);
    fsMocks.readFile.mockRejectedValueOnce(new Error("ENOENT"));

    const res = await GET(fakeRequest(), { params: { assetId: "1" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/missing on disk/i);
  });

  it("serves from Blob and forwards the ETag when a token is configured", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token";
    dbMocks.limit.mockResolvedValueOnce([{ id: 1, storagePath: "4/doc/1.png" }]);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    blobGet.mockResolvedValueOnce({
      statusCode: 200,
      stream,
      blob: { etag: "abc123", contentType: "image/png" },
    });

    const res = await GET(fakeRequest(), { params: { assetId: "1" } });

    expect(res.status).toBe(200);
    expect(blobGet).toHaveBeenCalledWith("4/doc/1.png", { access: "private" });
    expect(res.headers.get("ETag")).toBe("abc123");
    expect(fsMocks.readFile).not.toHaveBeenCalled();
  });

  it("returns 304 without a body when If-None-Match matches the current ETag", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token";
    dbMocks.limit.mockResolvedValueOnce([{ id: 1, storagePath: "4/doc/1.png" }]);
    blobGet.mockResolvedValueOnce({
      statusCode: 200,
      stream: new ReadableStream(),
      blob: { etag: "abc123", contentType: "image/png" },
    });

    const res = await GET(fakeRequest({ "if-none-match": "abc123" }), {
      params: { assetId: "1" },
    });

    expect(res.status).toBe(304);
  });

  it("404s with a diagnosable message when Blob has no object for this key", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token";
    dbMocks.limit.mockResolvedValueOnce([{ id: 1, storagePath: "4/doc/1.png" }]);
    blobGet.mockResolvedValueOnce(null);

    const res = await GET(fakeRequest(), { params: { assetId: "1" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not have been uploaded/i);
  });

  it("does not mislabel a real Blob failure as 'not uploaded' — returns 502 instead", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "fake-token";
    dbMocks.limit.mockResolvedValueOnce([{ id: 1, storagePath: "4/doc/1.png" }]);
    blobGet.mockRejectedValueOnce(new Error("network error"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await GET(fakeRequest(), { params: { assetId: "1" } });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).not.toMatch(/not have been uploaded/i);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
