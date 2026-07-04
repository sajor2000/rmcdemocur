import fs from "fs/promises";
import { describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() =>
  vi.fn<(query: unknown) => Promise<{ rows: unknown[] }>>(() => Promise.resolve({ rows: [] })),
);
vi.mock("@/lib/db", () => ({ getDb: () => ({ execute }) }));

import { importFigureCaptions, parseFigureCaptionRows } from "@/scripts/import-figure-captions";

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

describe("importFigureCaptions", () => {
  it("upserts into figure_captions — never touches media_assets", async () => {
    vi.clearAllMocks();
    execute.mockResolvedValue({ rows: [] });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      `filename,label,text_for_embed
RMD563_FacultyGuide_Case3_MarieHernandez.docx,Answer image:,Serum amino acids table.`,
    );

    const summary = await importFigureCaptions("fake.csv");

    expect(summary).toEqual({ upserted: 1, skipped: 0 });
    expect(execute).toHaveBeenCalledTimes(1);
    const [query] = execute.mock.calls[0] as [{ queryChunks: unknown }];
    const queryText = JSON.stringify(query.queryChunks);
    expect(queryText).toContain("INSERT INTO figure_captions");
    expect(queryText).not.toContain("media_assets");

    vi.restoreAllMocks();
  });

  it("skips a row missing a required field without calling the database", async () => {
    vi.clearAllMocks();
    execute.mockResolvedValue({ rows: [] });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      `filename,label,text_for_embed
,Answer image:,Serum amino acids table.`,
    );

    const summary = await importFigureCaptions("fake.csv");

    expect(summary).toEqual({ upserted: 0, skipped: 1 });
    expect(execute).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
