import { describe, expect, it } from "vitest";
import {
  assertMediaAssetType,
  inferGuideKind,
  inferExtractionScope,
} from "@/lib/media-types";
import { buildDocumentFigureMeta } from "@/lib/figure-registry";

describe("media-types", () => {
  it("validates media asset type", () => {
    expect(assertMediaAssetType("figure")).toBe("figure");
    expect(() => assertMediaAssetType("pixel")).toThrow(/Invalid media asset type/);
  });

  it("infers guide kind and extraction scope", () => {
    expect(inferGuideKind("RMD563_FacultyGuide_Case4_JohnJackson.docx")).toBe("faculty");
    expect(inferGuideKind("RMD563_SelfStudyGuide_Case4_JohnJackson.docx")).toBe("self_study");

    const facultyDocx = buildDocumentFigureMeta(
      "RMD563_FacultyGuide_Case4_JohnJackson.docx",
      "docx",
      4,
    );
    expect(inferExtractionScope(facultyDocx)).toBe("faculty");

    const facultyPdf = buildDocumentFigureMeta(
      "RMD563_FacultyGuide_Case1_DavidTilo.pdf",
      "pdf",
      1,
    );
    expect(inferExtractionScope(facultyPdf)).toBe("pdf_pending");
  });
});
