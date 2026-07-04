import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const captionedAssetsWhere = vi.fn<() => Promise<Record<string, unknown>[]>>(() =>
    Promise.resolve([]),
  );
  const existingCaptionWhere = vi.fn<() => Promise<Record<string, unknown>[]>>(() =>
    Promise.resolve([]),
  );
  const selectWhereQueue: (typeof captionedAssetsWhere)[] = [];
  let selectCallIndex = 0;
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({ where: captionedAssetsWhere })),
      where: () => {
        const fn = selectWhereQueue[selectCallIndex] ?? existingCaptionWhere;
        selectCallIndex += 1;
        return fn();
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
    existingCaptionWhere,
    resetExistingQueue(results: Record<string, unknown>[][]) {
      selectCallIndex = 0;
      selectWhereQueue.length = 0;
      for (const result of results) {
        selectWhereQueue.push(vi.fn(() => Promise.resolve(result)));
      }
    },
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
  });

  it("rescues a captioned media_assets row with no matching figure_captions row", async () => {
    dbMocks.captionedAssetsWhere.mockResolvedValueOnce([
      { id: 5, filename: "f.docx", label: "Figure 1", sourceIndex: null, textForEmbed: "Old caption." },
    ]);
    dbMocks.resetExistingQueue([[]]); // no existing figure_captions row for this asset

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
    dbMocks.resetExistingQueue([[{ id: 99 }]]); // a figure_captions row already exists

    const summary = await migrateCaptionsToInputTable();

    expect(summary.rescued).toBe(0);
    expect(summary.alreadyCovered).toBe(1);
    expect(summary.reported).toEqual([]);
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });
});
