import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ALL_CURRICULUM_FILES,
  FACULTY_GUIDES,
  SELF_STUDY_GUIDES,
  shouldCopyFile,
} from "../../scripts/curriculum-sources";

describe("curriculum-sources", () => {
  it("lists 7 faculty and 7 self-study guides", () => {
    expect(FACULTY_GUIDES).toHaveLength(7);
    expect(SELF_STUDY_GUIDES).toHaveLength(7);
    expect(ALL_CURRICULUM_FILES).toHaveLength(14);
  });

  it("assigns case numbers 1-7 for each guide type", () => {
    for (const guide of ALL_CURRICULUM_FILES) {
      expect(guide.caseNumber).toBeGreaterThanOrEqual(1);
      expect(guide.caseNumber).toBeLessThanOrEqual(7);
      expect(guide.dest.length).toBeGreaterThan(0);
    }
  });
});

describe("shouldCopyFile", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("copies when destination is missing", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "curriculum-copy-"));
    const src = path.join(tmpDir, "src.txt");
    await fs.writeFile(src, "hello");
    expect(await shouldCopyFile(src, path.join(tmpDir, "dest.txt"))).toBe(true);
  });

  it("skips when size and mtime match", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "curriculum-copy-"));
    const src = path.join(tmpDir, "src.txt");
    const dest = path.join(tmpDir, "dest.txt");
    await fs.writeFile(src, "hello");
    await fs.copyFile(src, dest);
    expect(await shouldCopyFile(src, dest)).toBe(false);
  });

  it("copies when same size but source is newer", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "curriculum-copy-"));
    const src = path.join(tmpDir, "src.txt");
    const dest = path.join(tmpDir, "dest.txt");
    await fs.writeFile(dest, "hello");
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(src, "hello");
    expect(await shouldCopyFile(src, dest)).toBe(true);
  });
});
