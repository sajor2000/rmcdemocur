import { describe, expect, it } from "vitest";
import {
  buildAlignmentSystemPrompt,
  normalizeAlignmentIds,
  validateAlignments,
} from "@/lib/framework-catalog";

describe("framework-catalog", () => {
  it("buildAlignmentSystemPrompt lists only provided candidate IDs", () => {
    const prompt = buildAlignmentSystemPrompt("USMLE", [
      { stableId: "usmle:cv:leaf1", label: "CV — arrhythmia", description: "Atrial fibrillation" },
    ]);
    expect(prompt).toContain("usmle:cv:leaf1");
    expect(prompt).toContain("AUTHORITATIVE LIST");
    expect(prompt).not.toContain("MK1");
  });

  it("validateAlignments drops IDs not in catalog", () => {
    const allowed = new Set(["aamc:mk1"]);
    const results = validateAlignments(
      [
        { framework_id: "aamc:mk1", framework_label: "MK1", confidence: 0.9, rationale: "ok" },
        { framework_id: "invented", framework_label: "X", confidence: 0.95, rationale: "bad" },
        { framework_id: "aamc:mk1", framework_label: "MK1", confidence: 0.4, rationale: "low" },
      ],
      allowed,
      "AAMC",
    );
    expect(results).toHaveLength(1);
    expect(results[0].framework_id).toBe("aamc:mk1");
  });

  it("normalizeAlignmentIds maps USMLE domain to framework_id", () => {
    const normalized = normalizeAlignmentIds(
      [{ domain: "usmle:gi:leaf", framework_label: "GI", confidence: 0.8, rationale: "x" }],
      "USMLE",
    );
    expect(normalized[0].framework_id).toBe("usmle:gi:leaf");
  });
});
