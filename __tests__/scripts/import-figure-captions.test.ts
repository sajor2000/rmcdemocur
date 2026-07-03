import { describe, expect, it } from "vitest";
import { parseFigureCaptionRows } from "@/scripts/import-figure-captions";

describe("import-figure-captions CSV parsing", () => {
  it("parses example CSV columns", () => {
    const rows = parseFigureCaptionRows(`filename,label,text_for_embed
RMD563_FacultyGuide_Case3_MarieHernandez.docx,Answer image:,Serum amino acids table.`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.filename).toContain("Case3");
    expect(rows[0]?.textForEmbed).toContain("Serum amino acids");
  });

  it("handles commas inside quoted caption text", () => {
    const rows = parseFigureCaptionRows(`filename,label,text_for_embed
RMD563_FacultyGuide_Case4_JohnJackson.docx,Answer Image 1A:,"Alcohol-related cirrhosis, trichrome stain."`);
    expect(rows[0]?.textForEmbed).toBe("Alcohol-related cirrhosis, trichrome stain.");
  });

  it("reads optional storage_index column", () => {
    const rows = parseFigureCaptionRows(`filename,label,text_for_embed,storage_index
RMD563_FacultyGuide_Case3_MarieHernandez.docx,Answer image:,Serum table.,12`);
    expect(rows[0]?.storageIndex).toBe(12);
  });
});
