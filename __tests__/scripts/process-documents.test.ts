import { describe, expect, it } from "vitest";
import {
  deriveDocumentPipelineStatus,
  isDocumentPipelineComplete,
  loadDocumentPipelineStatusMap,
  summarizeProcessing,
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

describe("summarizeProcessing (U4 per-document isolation)", () => {
  it("reports success and exit 0 when nothing failed", () => {
    const result = summarizeProcessing(3, []);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("processed 3");
    expect(result.message).not.toMatch(/failed/i);
  });

  it("reports failures and exit 1 when a document threw", () => {
    const result = summarizeProcessing(2, [
      { filename: "RMD563_FacultyGuide_Case2_JessicaDonner.docx", error: "Corrupted zip" },
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("processed 2");
    expect(result.message).toContain("failed 1");
    expect(result.message).toContain("RMD563_FacultyGuide_Case2_JessicaDonner.docx");
    expect(result.message).toContain("Corrupted zip");
  });
});
