import { describe, expect, it } from "vitest";
import {
  deriveDocumentPipelineStatus,
  isDocumentPipelineComplete,
  loadDocumentPipelineStatusMap,
} from "../../scripts/process-documents";

describe("deriveDocumentPipelineStatus", () => {
  it("returns empty when no chunks", () => {
    expect(
      deriveDocumentPipelineStatus({
        chunkCount: 0,
        chunksWithEmbedding: 0,
        alignedChunkCount: 0,
      }),
    ).toBe("empty");
  });

  it("returns partial-embed when chunks lack embeddings", () => {
    expect(
      deriveDocumentPipelineStatus({
        chunkCount: 5,
        chunksWithEmbedding: 2,
        alignedChunkCount: 0,
      }),
    ).toBe("partial-embed");
  });

  it("returns partial-align when embedded but not all chunks aligned", () => {
    expect(
      deriveDocumentPipelineStatus({
        chunkCount: 5,
        chunksWithEmbedding: 5,
        alignedChunkCount: 0,
      }),
    ).toBe("partial-align");
    expect(
      deriveDocumentPipelineStatus({
        chunkCount: 5,
        chunksWithEmbedding: 5,
        alignedChunkCount: 3,
      }),
    ).toBe("partial-align");
  });

  it("returns complete when all chunks embedded and aligned", () => {
    expect(
      deriveDocumentPipelineStatus({
        chunkCount: 5,
        chunksWithEmbedding: 5,
        alignedChunkCount: 5,
      }),
    ).toBe("complete");
  });
});

describe("isDocumentPipelineComplete", () => {
  it("is exported for bootstrap smoke verification", () => {
    expect(typeof isDocumentPipelineComplete).toBe("function");
  });
});

describe("loadDocumentPipelineStatusMap", () => {
  it("is exported for batch audit queries", () => {
    expect(typeof loadDocumentPipelineStatusMap).toBe("function");
  });
});
