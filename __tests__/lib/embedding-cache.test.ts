import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("embedding-cache", () => {
  let originalCwd: string;
  let tmpDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "embedding-cache-"));
    await fs.mkdir(path.join(tmpDir, "data/frameworks"), { recursive: true });
    process.chdir(tmpDir);
    vi.resetModules();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function loadModule() {
    return import("../../lib/embedding-cache");
  }

  it("returns null for missing cache entry", async () => {
    const mod = await loadModule();
    expect(await mod.readCachedEmbedding("usmle:test")).toBeNull();
  });

  it("loads, appends, and reads cached vectors", async () => {
    const mod = await loadModule();
    const cache = await mod.loadEmbeddingCache();
    const vector = [0.1, 0.2, 0.3];

    await mod.appendCachedEmbedding("usmle:abc", vector, cache);
    await mod.appendCachedEmbedding("usmle:def", [1, 2, 3], cache);

    expect(cache.get("usmle:abc")).toEqual(vector);
    expect(await mod.readCachedEmbedding("usmle:abc", cache)).toEqual(vector);
    expect(await mod.readCachedEmbedding("usmle:missing", cache)).toBeNull();
  });

  it("skips duplicate appends for the same stableId", async () => {
    const mod = await loadModule();
    const cache = await mod.loadEmbeddingCache();

    await mod.appendCachedEmbedding("usmle:abc", [1], cache);
    await mod.appendCachedEmbedding("usmle:abc", [2], cache);

    expect(cache.get("usmle:abc")).toEqual([1]);
  });
});
