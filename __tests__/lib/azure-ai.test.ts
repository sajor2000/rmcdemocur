import { afterEach, describe, expect, it } from "vitest";
import { resolveEmbeddingDimensions } from "@/lib/azure-ai";

const ENV_KEYS = [
  "AZURE_OPENAI_DEPLOYMENT_EMBED",
  "AZURE_OPENAI_EMBEDDING_DIMENSIONS",
] as const;

describe("resolveEmbeddingDimensions", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  it("returns 1536 when embed deployment is text-embedding-3-large", () => {
    process.env.AZURE_OPENAI_DEPLOYMENT_EMBED = "text-embedding-3-large";
    expect(resolveEmbeddingDimensions()).toBe(1536);
  });

  it("omits dimensions for text-embedding-3-small (native 1536)", () => {
    process.env.AZURE_OPENAI_DEPLOYMENT_EMBED = "text-embedding-3-small";
    expect(resolveEmbeddingDimensions()).toBeUndefined();
  });

  it("forces dimensions from AZURE_OPENAI_EMBEDDING_DIMENSIONS when set", () => {
    process.env.AZURE_OPENAI_DEPLOYMENT_EMBED = "my-custom-embed";
    process.env.AZURE_OPENAI_EMBEDDING_DIMENSIONS = "1536";
    expect(resolveEmbeddingDimensions()).toBe(1536);
  });
});
