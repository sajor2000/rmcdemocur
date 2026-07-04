import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  blobConfigured,
  mediaFilePath,
  mediaLocatorKey,
  resolveMediaKeyPath,
} from "@/lib/media-storage";

describe("mediaLocatorKey", () => {
  it("builds a relative key — never an absolute path", () => {
    const key = mediaLocatorKey(4, "RMD563_FacultyGuide_Case4_JohnJackson.docx", 3, "png");
    expect(key).toBe("4/RMD563_FacultyGuide_Case4_JohnJackson/3.png");
  });

  it("normalizes an extension without a leading dot", () => {
    const key = mediaLocatorKey(1, "doc.docx", 2, "jpg");
    expect(key.endsWith("2.jpg")).toBe(true);
  });
});

describe("resolveMediaKeyPath", () => {
  it("resolves a relative key under the media root", () => {
    const resolved = resolveMediaKeyPath("4/RMD563_FacultyGuide_Case4_JohnJackson/3.png");
    expect(resolved).not.toBeNull();
    expect(resolved).toContain("data/curriculum/media");
    expect(resolved).toContain(
      path.join("4", "RMD563_FacultyGuide_Case4_JohnJackson", "3.png"),
    );
  });

  it("rejects a traversal attempt", () => {
    expect(resolveMediaKeyPath("../../etc/passwd")).toBeNull();
    expect(resolveMediaKeyPath("/etc/passwd")).toBeNull();
  });

  it("rejects a key that resolves to the root itself", () => {
    expect(resolveMediaKeyPath(".")).toBeNull();
  });
});

describe("mediaFilePath", () => {
  it("returns the resolved absolute path for a locator key", () => {
    const filePath = mediaFilePath(4, "RMD563_FacultyGuide_Case4_JohnJackson.docx", 3, "png");
    const expectedKey = mediaLocatorKey(4, "RMD563_FacultyGuide_Case4_JohnJackson.docx", 3, "png");
    expect(filePath).toBe(resolveMediaKeyPath(expectedKey));
  });
});

describe("blobConfigured", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("is false when neither credential env var is set", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    expect(blobConfigured()).toBe(false);
  });

  it("is true with a static read-write token", () => {
    delete process.env.BLOB_STORE_ID;
    process.env.BLOB_READ_WRITE_TOKEN = "token";
    expect(blobConfigured()).toBe(true);
  });

  it("is true with a store id (the dashboard-connected OIDC flow)", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_STORE_ID = "store_123";
    expect(blobConfigured()).toBe(true);
  });
});
