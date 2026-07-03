import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("bootstrap-state", () => {
  let originalCwd: string;
  let tmpDir: string;
  let mod: typeof import("../../lib/bootstrap-state");

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-state-"));
    await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
    process.chdir(tmpDir);
    vi.resetModules();
    mod = await import("../../lib/bootstrap-state");
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns default state when file missing", async () => {
    const state = await mod.loadBootstrapState();
    expect(state.phase).toBe("idle");
    expect(state.smokeVerified).toBe(false);
    expect(state.version).toBe(1);
  });

  it("persists and reloads state", async () => {
    const state = await mod.loadBootstrapState();
    state.phase = "frameworks";
    state.frameworks.usmle = { embedded: 10, total: 614, complete: false };
    await mod.saveBootstrapState(state);

    const reloaded = await mod.loadBootstrapState();
    expect(reloaded.phase).toBe("frameworks");
    expect(reloaded.frameworks.usmle.embedded).toBe(10);
  });

  it("updateBootstrapState merges patches", async () => {
    const state = await mod.updateBootstrapState({ phase: "schema" });
    expect(state.phase).toBe("schema");

    const reloaded = await mod.loadBootstrapState();
    expect(reloaded.phase).toBe("schema");
  });

  it("maybeCheckpoint saves only when interval elapsed", async () => {
    const state = await mod.loadBootstrapState();
    const timer = new mod.CheckpointTimer(50);

    await mod.maybeCheckpoint(timer, state, "test");
    await expect(fs.access(mod.BOOTSTRAP_STATE_PATH)).rejects.toThrow();

    await new Promise((r) => setTimeout(r, 60));
    await mod.maybeCheckpoint(timer, state, "test");
    await expect(fs.access(mod.BOOTSTRAP_STATE_PATH)).resolves.toBeUndefined();
  });
});
