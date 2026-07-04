import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const captionedAssetsWhere = vi.fn<() => Promise<Record<string, unknown>[]>>(() =>
    Promise.resolve([]),
  );
  const existingCaptionsFrom = vi.fn<() => Promise<Record<string, unknown>[]>>(() =>
    Promise.resolve([]),
  );
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({ where: captionedAssetsWhere })),
      then(onFulfilled?: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) {
        return existingCaptionsFrom().then(onFulfilled, onRejected);
      },
    })),
  }));
  const onConflictDoNothing = vi.fn(() => Promise.resolve(undefined));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  return {
    select,
    insert,
    values,
    onConflictDoNothing,
    captionedAssetsWhere,
    existingCaptionsFrom,
  };
});

vi.mock("@/lib/db", () => ({ getDb: () => dbMocks }));

import { migrateCaptionsToInputTable } from "@/scripts/migrate-captions";

describe("migrateCaptionsToInputTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.insert.mockReturnValue({ values: dbMocks.values });
    dbMocks.values.mockReturnValue({ onConflictDoNothing: dbMocks.onConflictDoNothing });
    dbMocks.onConflictDoNothing.mockResolvedValue(undefined);
    dbMocks.existingCaptionsFrom.mockResolvedValue([]);
  });

  it("rescues a captioned media_assets row with no matching figure_captions row", async () => {
    dbMocks.captionedAssetsWhere.mockResolvedValueOnce([
      { id: 5, filename: "f.docx", label: "Figure 1", sourceIndex: null, textForEmbed: "Old caption." },
    ]);
    dbMocks.existingCaptionsFrom.mockResolvedValueOnce([]); // no existing figure_captions rows at all

    const summary = await migrateCaptionsToInputTable();

    expect(summary.rescued).toBe(1);
    expect(summary.alreadyCovered).toBe(0);
    expect(summary.reported).toEqual([{ mediaAssetId: 5, filename: "f.docx", label: "Figure 1" }]);
    expect(dbMocks.insert).toHaveBeenCalledTimes(1);
    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "f.docx", label: "Figure 1", textForEmbed: "Old caption." }),
    );
  });

  it("leaves a caption alone when a figure_captions row already covers it", async () => {
    dbMocks.captionedAssetsWhere.mockResolvedValueOnce([
      { id: 6, filename: "f.docx", label: "Figure 2", sourceIndex: null, textForEmbed: "Covered caption." },
    ]);
    dbMocks.existingCaptionsFrom.mockResolvedValueOnce([{ filename: "f.docx", label: "Figure 2" }]);

    const summary = await migrateCaptionsToInputTable();

    expect(summary.rescued).toBe(0);
    expect(summary.alreadyCovered).toBe(1);
    expect(summary.reported).toEqual([]);
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it("only queries figure_captions once regardless of the number of captioned assets", async () => {
    dbMocks.captionedAssetsWhere.mockResolvedValueOnce([
      { id: 5, filename: "a.docx", label: "Figure 1", sourceIndex: null, textForEmbed: "A." },
      { id: 6, filename: "b.docx", label: "Figure 2", sourceIndex: null, textForEmbed: "B." },
      { id: 7, filename: "c.docx", label: "Figure 3", sourceIndex: null, textForEmbed: "C." },
    ]);
    dbMocks.existingCaptionsFrom.mockResolvedValueOnce([]);

    await migrateCaptionsToInputTable();

    expect(dbMocks.existingCaptionsFrom).toHaveBeenCalledTimes(1);
  });
});
