import { describe, expect, it } from "vitest";
import {
  deriveDocumentPipelineStatus,
  isDocumentPipelineComplete,
} from "../../scripts/process-documents";

describe("deriveDocumentPipelineStatus", () => {
  it("returns empty when no chunks", () => {
    expect(
      deriveDocumentPipelineStatus({
        chunkCount: 0,
        chunksWithEmbedding: 0,
        alignmentCount: 0,
      }),
    ).toBe("empty");
  });

  it("returns partial-embed when chunks lack embeddings", () => {
    expect(
      deriveDocumentPipelineStatus({
        chunkCount: 5,
        chunksWithEmbedding: 2,
        alignmentCount: 0,
      }),
    ).toBe("partial-embed");
  });

  it("returns partial-align when embedded but no alignments", () => {
    expect(
      deriveDocumentPipelineStatus({
        chunkCount: 5,
        chunksWithEmbedding: 5,
        alignmentCount: 0,
      }),
    ).toBe("partial-align");
  });

  it("returns complete when chunks embedded and alignments exist", () => {
    expect(
      deriveDocumentPipelineStatus({
        chunkCount: 5,
        chunksWithEmbedding: 5,
        alignmentCount: 3,
      }),
    ).toBe("complete");
  });
});

describe("isDocumentPipelineComplete", () => {
  it("is exported for bootstrap smoke verification", () => {
    expect(typeof isDocumentPipelineComplete).toBe("function");
  });
});
