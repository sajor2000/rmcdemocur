import path from "path";
import { describe, expect, it } from "vitest";
import { MEDIA_ROOT, resolveSafeMediaPath } from "@/lib/media-storage";

describe("resolveSafeMediaPath", () => {
  it("allows paths under the media root", () => {
    const allowed = path.join(MEDIA_ROOT, "4", "RMD563_FacultyGuide_Case4_JohnJackson", "3.png");
    expect(resolveSafeMediaPath(allowed)).toBe(path.resolve(allowed));
  });

  it("rejects paths outside the media root", () => {
    expect(resolveSafeMediaPath("/etc/passwd")).toBeNull();
    expect(resolveSafeMediaPath(path.join(process.cwd(), ".env.local"))).toBeNull();
  });
});
