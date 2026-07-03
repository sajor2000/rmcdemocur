import { describe, expect, it } from "vitest";
import {
  assignFacultyAnswerImageStoragePaths,
  buildEmbedTextForChunk,
  linkedMediaIdsForChunk,
} from "@/lib/media-pipeline";
import type { FigureRegistryEntry } from "@/lib/media-types";

describe("assignFacultyAnswerImageStoragePaths", () => {
  it("maps answer images to the last N extracted files in document order", () => {
    const registry: FigureRegistryEntry[] = [
      {
        label: "Answer Image 1A",
        referenceKind: "answer_image",
        section: null,
        lineIndex: 10,
        hasCaptionInText: true,
        textForEmbed: "Caption one",
        extractionScope: "faculty",
        sourceIndex: 1,
        type: "figure",
      },
      {
        label: "Answer Image 2",
        referenceKind: "answer_image",
        section: null,
        lineIndex: 20,
        hasCaptionInText: true,
        textForEmbed: "Caption two",
        extractionScope: "faculty",
        sourceIndex: 2,
        type: "figure",
      },
    ];
    const extracted = [
      { sourceIndex: 1, storagePath: "/tmp/media/1.png" },
      { sourceIndex: 2, storagePath: "/tmp/media/2.png" },
      { sourceIndex: 3, storagePath: "/tmp/media/3.png" },
      { sourceIndex: 4, storagePath: "/tmp/media/4.png" },
    ];

    const map = assignFacultyAnswerImageStoragePaths(registry, extracted);
    expect(map.get(10)).toBe("/tmp/media/3.png");
    expect(map.get(20)).toBe("/tmp/media/4.png");
  });

  it("enriches embed text only for linked faculty media ids", () => {
    const assets = [
      {
        id: 1,
        label: "Answer Image 1A",
        textForEmbed: "Cirrhosis caption.",
        referenceKind: "answer_image",
      },
      {
        id: 2,
        label: "Figure 2A",
        textForEmbed: "Histology caption.",
        referenceKind: "figure",
      },
    ];
    const linkedIds = linkedMediaIdsForChunk(10, [{ chunkId: 10, mediaAssetId: 1 }]);
    const enriched = buildEmbedTextForChunk(
      "Answer Image 1A appears here.",
      "Case › Section › body",
      assets,
      linkedIds,
    );
    expect(enriched).toContain("Cirrhosis caption.");
    expect(enriched).not.toContain("Histology caption.");
  });
});
