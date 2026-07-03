import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildUsmleChildStableId,
  parseAamcKeywordsSheet,
  parseUsmleOutlineText,
  slugify,
} from "@/lib/framework-parsers";
import {
  buildAlignmentSystemPrompt,
  validateAlignments,
} from "@/lib/framework-catalog";

describe("slugify", () => {
  it("normalizes system names", () => {
    expect(slugify("Renal & Urinary System")).toBe("renal-and-urinary-system");
  });
});

describe("buildUsmleChildStableId", () => {
  it("truncates slug so full id fits 120 chars", () => {
    const parent = "usmle:pregnancy-childbirth-and-the-puerperium";
    const id = buildUsmleChildStableId(
      parent,
      "screening alpha-fetoprotein diabetes mellitus neural tube defects Rh isoimmunization",
    );
    expect(id.length).toBeLessThanOrEqual(120);
    expect(id.startsWith(`${parent}:`)).toBe(true);
  });
});

describe("parseUsmleOutlineText", () => {
  it("parses systems and subsections from snippet", () => {
    const text = readFileSync(
      path.join(__dirname, "../fixtures/frameworks/usmle-snippet.txt"),
      "utf-8",
    );
    const rows = parseUsmleOutlineText(text, "fixture");
    const systems = rows.filter((r) => r.parentStableId === null);
    expect(systems.length).toBeGreaterThanOrEqual(2);
    const gi = rows.find((r) => r.domain === "Gastrointestinal System");
    expect(gi?.stableId).toBe("usmle:gastrointestinal-system");
    const subs = rows.filter(
      (r) => r.parentStableId === "usmle:gastrointestinal-system",
    );
    expect(subs.length).toBeGreaterThan(0);
  });

  it("skips TOC runs and keeps GI subdomains under gastrointestinal-system", () => {
    const text = readFileSync(
      path.join(__dirname, "../fixtures/frameworks/usmle-toc-snippet.txt"),
      "utf-8",
    );
    const rows = parseUsmleOutlineText(text, "fixture-toc");

    const giMisplaced = rows.find(
      (r) =>
        r.parentStableId === "usmle:social-sciences" &&
        r.subdomain === "Gastrointestinal System",
    );
    expect(giMisplaced).toBeUndefined();

    const giSubs = rows.filter(
      (r) => r.parentStableId === "usmle:gastrointestinal-system",
    );
    expect(giSubs.length).toBeGreaterThan(0);
    expect(giSubs[0].domain).toBe("Gastrointestinal System");
    expect(giSubs.some((r) => /infectious/i.test(r.subdomain ?? ""))).toBe(
      true,
    );

    const ssSubs = rows.filter(
      (r) => r.parentStableId === "usmle:social-sciences",
    );
    expect(ssSubs.every((r) => r.domain === "Social Sciences")).toBe(true);
    expect(
      ssSubs.some((r) => /ethics|jurisprudence/i.test(r.subdomain ?? "")),
    ).toBe(true);
  });
});

describe("parseAamcKeywordsSheet", () => {
  it("parses keyword rows from headered sheet", () => {
    const rows = parseAamcKeywordsSheet(
      [
        ["ID", "Keyword", "Combined", "Definition"],
        ["K001", "acute care", "K001: acute care", "Emergency care definition"],
      ],
      "fixture.xlsx",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].keywordId).toBe("K001");
    expect(rows[0].stableId).toBe("aamc-kw:k001");
  });

  it("throws when header missing", () => {
    expect(() => parseAamcKeywordsSheet([["bad"]], "bad.xlsx")).toThrow(
      /header row not found/i,
    );
  });
});

describe("validateAlignments", () => {
  it("drops IDs not in candidate list", () => {
    const allowed = new Set(["usmle:gi:foo"]);
    const result = validateAlignments(
      [
        {
          domain: "usmle:gi:foo",
          confidence: 0.9,
          rationale: "match",
        },
        {
          domain: "invented",
          confidence: 0.95,
          rationale: "bad",
        },
      ],
      allowed,
      "USMLE",
    );
    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe("usmle:gi:foo");
  });
});

describe("buildAlignmentSystemPrompt", () => {
  it("includes candidate stable IDs", () => {
    const prompt = buildAlignmentSystemPrompt("USMLE", [
      { stableId: "usmle:gi:test", label: "GI test", description: "desc" },
    ]);
    expect(prompt).toContain("usmle:gi:test");
    expect(prompt).toContain("ONLY return IDs");
  });
});
