import { describe, expect, it } from "vitest";
import { enrichEmbedText, linkChunksToMedia } from "@/lib/media-linker";

describe("media-linker", () => {
  it("links chunks containing faculty answer image labels", () => {
    const links = linkChunksToMedia(
      [{ id: 1, content: "Review Answer Image 1A: cirrhosis findings.", section: "Answers" }],
      [
        {
          id: 10,
          label: "Answer Image 1A",
          textForEmbed: "Alcohol-related cirrhosis with trichrome stain.",
          referenceKind: "answer_image",
        },
      ],
    );
    expect(links).toEqual([{ chunkId: 1, mediaAssetId: 10 }]);
  });

  it("prepends caption text only when missing from chunk and embed input", () => {
    const enriched = enrichEmbedText(
      "Answer Image 1A appears below.",
      "Case › Section › chunk",
      [
        {
          label: "Answer Image 1A",
          textForEmbed: "Alcohol-related cirrhosis with trichrome stain.",
        },
      ],
    );
    expect(enriched).toContain("Alcohol-related cirrhosis");
    expect(enriched).toContain("Case › Section › chunk");
  });

  it("skips duplicate caption enrichment", () => {
    const caption = "Alcohol-related cirrhosis with trichrome stain.";
    const enriched = enrichEmbedText(
      caption,
      `Case › Section › ${caption}`,
      [{ label: "Answer Image 1A", textForEmbed: caption }],
    );
    expect(enriched).toBe(`Case › Section › ${caption}`);
  });
});
