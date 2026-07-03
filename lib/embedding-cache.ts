import fs from "fs/promises";
import path from "path";

const CACHE_PATH = path.join(
  process.cwd(),
  "data/frameworks/.embedding-cache.jsonl",
);

export type EmbeddingCacheEntry = {
  stableId: string;
  model: string;
  dimensions: number;
  vector: number[];
};

export function embeddingCacheFingerprint(): {
  model: string;
  dimensions: number;
} {
  return {
    model: process.env.AZURE_OPENAI_DEPLOYMENT_EMBED ?? "unknown",
    dimensions: Number(process.env.AZURE_OPENAI_EMBEDDING_DIMENSIONS ?? 1536),
  };
}

function entryMatchesFingerprint(entry: EmbeddingCacheEntry): boolean {
  const fp = embeddingCacheFingerprint();
  return entry.model === fp.model && entry.dimensions === fp.dimensions;
}

export async function loadEmbeddingCache(): Promise<Map<string, number[]>> {
  const cache = new Map<string, number[]>();
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as Partial<EmbeddingCacheEntry> & {
        vector: number[];
      };
      if (!parsed.stableId || !parsed.vector) continue;
      if (!parsed.model || parsed.dimensions == null) continue;
      const entry = parsed as EmbeddingCacheEntry;
      if (!entryMatchesFingerprint(entry)) continue;
      if (!cache.has(entry.stableId)) {
        cache.set(entry.stableId, entry.vector);
      }
    }
  } catch {
    // no cache yet
  }
  return cache;
}

export async function readCachedEmbedding(
  stableId: string,
  cache?: Map<string, number[]>,
): Promise<number[] | null> {
  if (cache?.has(stableId)) {
    return cache.get(stableId)!;
  }
  const loaded = await loadEmbeddingCache();
  return loaded.get(stableId) ?? null;
}

export async function appendCachedEmbedding(
  stableId: string,
  vector: number[],
  cache?: Map<string, number[]>,
): Promise<void> {
  if (cache?.has(stableId)) return;
  const { model, dimensions } = embeddingCacheFingerprint();
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const entry: EmbeddingCacheEntry = { stableId, model, dimensions, vector };
  await fs.appendFile(CACHE_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  cache?.set(stableId, vector);
}

export async function countCachedEmbeddings(): Promise<number> {
  return (await loadEmbeddingCache()).size;
}
