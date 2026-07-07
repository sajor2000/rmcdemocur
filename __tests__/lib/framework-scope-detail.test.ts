import { describe, expect, it } from "vitest";
import { frameworkScopeDetail } from "@/lib/utils";

describe("frameworkScopeDetail (gap-card scope hint)", () => {
  it("surfaces the real scope when the subdomain label is terse/ambiguous", () => {
    // The USMLE node whose subdomain is just "pancreas" actually scopes
    // metastatic neoplasms — this is the exact demo-feedback case.
    expect(frameworkScopeDetail("pancreas", "metastatic neoplasms")).toBe("metastatic neoplasms");
  });

  it("returns undefined when there is no fullText", () => {
    expect(frameworkScopeDetail("pancreas", "")).toBeUndefined();
    expect(frameworkScopeDetail("pancreas", null)).toBeUndefined();
    expect(frameworkScopeDetail("pancreas", undefined)).toBeUndefined();
  });

  it("returns undefined when fullText merely restates the label", () => {
    expect(frameworkScopeDetail("Disorders of the pancreas", "Disorders of the pancreas and biliary tree")).toBeUndefined();
  });

  it("truncates long scope text with an ellipsis", () => {
    const long = "a".repeat(200);
    const out = frameworkScopeDetail("x", long, 120)!;
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out.endsWith("…")).toBe(true);
  });
});
