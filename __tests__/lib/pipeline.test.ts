import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
  };
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue([]);

  const updateChain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };
  updateChain.set.mockReturnValue(updateChain);
  updateChain.where.mockReturnValue(updateChain);
  updateChain.returning.mockReturnValue([]);

  return {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
    execute: vi.fn(),
    selectChain,
    updateChain,
  };
});

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: dbMocks.select,
    update: dbMocks.update,
    execute: dbMocks.execute,
  }),
}));

import { advanceJob } from "@/lib/pipeline";

describe("advanceJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue([]);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.returning.mockReturnValue([]);
  });

  it("returns early when job is already complete", async () => {
    const completeJob = {
      id: 1,
      documentId: 10,
      status: "complete",
      stage: "complete",
    };
    dbMocks.selectChain.where.mockReturnValueOnce([completeJob]);

    const result = await advanceJob(1);
    expect(result).toEqual(completeJob);
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("returns early when job is already running", async () => {
    const runningJob = {
      id: 2,
      documentId: 10,
      status: "running",
      stage: "embedding",
    };
    dbMocks.selectChain.where.mockReturnValueOnce([runningJob]);

    const result = await advanceJob(2);
    expect(result).toEqual(runningJob);
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("throws when job is missing", async () => {
    dbMocks.selectChain.where.mockReturnValueOnce([]);

    await expect(advanceJob(99)).rejects.toThrow("Job not found");
  });
});
