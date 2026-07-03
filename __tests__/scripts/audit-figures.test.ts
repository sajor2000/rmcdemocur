import { describe, expect, it } from "vitest";
import { buildDocumentFigureMeta, buildFigureRegistry } from "@/lib/figure-registry";

describe("audit-figures gate logic", () => {
  it("passes PDF faculty answer image when caption text exists without file", () => {
    const meta = buildDocumentFigureMeta(
      "RMD563_FacultyGuide_Case2_JessicaDonner.pdf",
      "pdf",
      2,
    );
    const registry = buildFigureRegistry(
      "Answer image: Philip Armstrong sigmoidoscopy ulcerative colitis\nMore detail here.",
      meta,
    );
    const row = registry.find((entry) => entry.referenceKind === "answer_image");
    expect(row?.textForEmbed).toBeTruthy();
    const hasText = Boolean(row?.textForEmbed?.trim());
    const hasFile = false;
    expect(hasText || hasFile).toBe(true);
  });

  it("flags faculty answer image missing caption and file", () => {
    const meta = buildDocumentFigureMeta(
      "RMD563_FacultyGuide_Case4_JohnJackson.docx",
      "docx",
      4,
    );
    const registry = buildFigureRegistry("Answer Image 9Z:\n", meta);
    const row = registry.find((entry) => entry.referenceKind === "answer_image");
    const hasText = Boolean(row?.textForEmbed?.trim());
    const hasFile = false;
    expect(hasText || hasFile).toBe(false);
  });
});
