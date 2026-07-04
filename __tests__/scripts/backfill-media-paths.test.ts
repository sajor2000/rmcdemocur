import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const selectWhere = vi.fn<() => Promise<{ id: number; storagePath: string | null }[]>>(() =>
    Promise.resolve([]),
  );
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const updateWhere = vi.fn(() => Promise.resolve(undefined));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  return { select, selectFrom, selectWhere, update, updateSet, updateWhere };
});

vi.mock("@/lib/db", () => ({ getDb: () => dbMocks }));

import {
  backfillMediaPaths,
  isAbsoluteLikePath,
  toLocatorKey,
} from "@/scripts/backfill-media-paths";

describe("isAbsoluteLikePath", () => {
  it("recognizes a POSIX absolute path", () => {
    expect(isAbsoluteLikePath("/Users/jc/Desktop/RMCMAP/data/curriculum/media/4/x/3.png")).toBe(true);
  });

  it("does not flag a relative locator key", () => {
    expect(isAbsoluteLikePath("4/RMD563_FacultyGuide_Case4_JohnJackson/3.png")).toBe(false);
  });
});

describe("toLocatorKey", () => {
  it("extracts the caseNumber/basename/sourceIndex.ext tail from any absolute prefix", () => {
    const key = toLocatorKey(
      "/Users/someone/other-machine/data/curriculum/media/4/RMD563_FacultyGuide_Case4_JohnJackson/3.png",
    );
    expect(key).toBe("4/RMD563_FacultyGuide_Case4_JohnJackson/3.png");
  });

  it("returns null for a path that doesn't match the expected shape", () => {
    expect(toLocatorKey("/some/unrelated/path.png")).toBeNull();
  });
});

describe("backfillMediaPaths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.select.mockReturnValue({ from: dbMocks.selectFrom });
    dbMocks.selectFrom.mockReturnValue({ where: dbMocks.selectWhere });
    dbMocks.update.mockReturnValue({ set: dbMocks.updateSet });
    dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });
    dbMocks.updateWhere.mockResolvedValue(undefined);
  });

  it("converts an absolute-path row and leaves an already-relative row untouched", async () => {
    dbMocks.selectWhere.mockResolvedValueOnce([
      { id: 1, storagePath: "/Users/jc/Desktop/RMCMAP/data/curriculum/media/4/x/3.png" },
      { id: 2, storagePath: "4/x/3.png" },
    ]);

    const summary = await backfillMediaPaths();

    expect(summary.converted).toBe(1);
    expect(summary.alreadyRelative).toBe(1);
    expect(summary.unrecognized).toEqual([]);
    expect(dbMocks.update).toHaveBeenCalledTimes(1);
    expect(dbMocks.updateSet).toHaveBeenCalledWith({ storagePath: "4/x/3.png" });
  });

  it("running the backfill a second time is a no-op for the now-relative row", async () => {
    dbMocks.selectWhere.mockResolvedValueOnce([{ id: 1, storagePath: "4/x/3.png" }]);

    const summary = await backfillMediaPaths();

    expect(summary.converted).toBe(0);
    expect(summary.alreadyRelative).toBe(1);
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("reports an unrecognized absolute path without mangling it", async () => {
    dbMocks.selectWhere.mockResolvedValueOnce([{ id: 3, storagePath: "/some/unrelated/path.png" }]);

    const summary = await backfillMediaPaths();

    expect(summary.converted).toBe(0);
    expect(summary.unrecognized).toEqual([{ id: 3, storagePath: "/some/unrelated/path.png" }]);
    expect(dbMocks.update).not.toHaveBeenCalled();
  });
});
