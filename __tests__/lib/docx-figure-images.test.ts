import { beforeEach, describe, expect, it, vi } from "vitest";

type ScriptItem =
  | { text: string }
  | { image: { contentType: string; bytes: Buffer } };

const mammothMocks = vi.hoisted(() => {
  let script: ScriptItem[] = [];

  // Simulates mammoth: convertToHtml walks a scripted sequence of paragraphs
  // (plain text or an image), invoking the caller's image handler for each
  // image in true document order and substituting its returned src into the
  // HTML output — the same contract real mammoth provides.
  const convertToHtml = vi.fn(
    async (_input: unknown, options: { convertImage: (image: unknown) => Promise<{ src: string }> }) => {
      const parts: string[] = [];
      for (const item of script) {
        if ("text" in item) {
          parts.push(`<p>${item.text}</p>`);
        } else {
          const fakeImage = {
            contentType: item.image.contentType,
            read: () => Promise.resolve(item.image.bytes),
          };
          const result = await options.convertImage(fakeImage);
          parts.push(`<p><img src="${result.src}" /></p>`);
        }
      }
      return { value: parts.join("") };
    },
  );
  const imgElement = vi.fn(
    (handler: (image: unknown) => Promise<{ src: string }>) => handler,
  );

  return {
    convertToHtml,
    images: { imgElement },
    setScript(items: ScriptItem[]) {
      script = items;
    },
  };
});

vi.mock("mammoth", () => ({ default: mammothMocks }));

import { extractLabeledFigureImages } from "@/lib/docx-figure-images";

describe("extractLabeledFigureImages", () => {
  beforeEach(() => {
    mammothMocks.setScript([]);
  });

  it("correlates a figure label to a qualifying image immediately following it", async () => {
    mammothMocks.setScript([
      { text: "Figure 1: A real caption" },
      { image: { contentType: "image/png", bytes: Buffer.alloc(5000, 1) } },
    ]);
    const images = await extractLabeledFigureImages(Buffer.from(""));
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ figureOrdinal: 1, label: "Figure 1", ext: "png" });
    expect(images[0].bytes.length).toBe(5000);
  });

  it("prefers the largest qualifying image across repeated mentions of the same label", async () => {
    mammothMocks.setScript([
      { text: "Figure 8.2: caption" },
      { image: { contentType: "image/png", bytes: Buffer.alloc(70, 1) } },
      { text: "Figure 8.2 mentioned again on a later slide" },
      { image: { contentType: "image/png", bytes: Buffer.alloc(700000, 1) } },
    ]);
    const images = await extractLabeledFigureImages(Buffer.from(""));
    expect(images).toHaveLength(1);
    expect(images[0].label).toBe("Figure 8.2");
    expect(images[0].bytes.length).toBe(700000);
  });

  it("skips a label whose only nearby image is below the minimum size threshold", async () => {
    mammothMocks.setScript([
      { text: "Figure 3: caption" },
      { image: { contentType: "image/png", bytes: Buffer.alloc(50, 1) } },
    ]);
    const images = await extractLabeledFigureImages(Buffer.from(""));
    expect(images).toHaveLength(0);
  });

  it("returns no image for a label with nothing nearby", async () => {
    mammothMocks.setScript([{ text: "Figure 9: caption with no image anywhere near" }]);
    const images = await extractLabeledFigureImages(Buffer.from(""));
    expect(images).toHaveLength(0);
  });

  it("assigns figureOrdinal in document order across distinct labels", async () => {
    mammothMocks.setScript([
      { text: "Figure 1: first" },
      { image: { contentType: "image/jpeg", bytes: Buffer.alloc(3000, 1) } },
      { text: "Figure 2: second" },
      { image: { contentType: "image/png", bytes: Buffer.alloc(3000, 1) } },
    ]);
    const images = await extractLabeledFigureImages(Buffer.from(""));
    expect(images.map((i) => [i.figureOrdinal, i.label, i.ext])).toEqual([
      [1, "Figure 1", "jpg"],
      [2, "Figure 2", "png"],
    ]);
  });
});
