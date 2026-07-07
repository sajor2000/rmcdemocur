import { readFileSync } from "fs";
import path from "path";
import pdf from "pdf-parse";
import { describe, expect, it } from "vitest";
import {
  buildUsmleChildStableId,
  loadAamcPcrsCatalog,
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

describe("parseUsmleOutlineText — wrapped continuation lines (U1)", () => {
  const rows = parseUsmleOutlineText(
    readFileSync(
      path.join(__dirname, "../fixtures/frameworks/usmle-wrapped-snippet.txt"),
      "utf-8",
    ),
    "fixture-wrapped",
  );
  const leaves = rows.filter((r) => r.parentStableId);
  const subs = leaves.map((r) => r.subdomain);

  it("emits only genuine subsection headers as leaves, not wrap fragments", () => {
    expect(subs).toEqual([
      "Adverse effects of drugs on the gastrointestinal system",
      "Disorders of the pancreas",
      "Nutritional disorders",
    ]);
  });

  it("does not turn wrapped continuation lines into leaves", () => {
    // These are tail-halves of wrapped bullets — including ones that start with
    // a capitalized genus name (Yersinia/Shigella) — and must not become leaves.
    for (const bad of ["ulcer disease", "thiazide", "Yersinia", "Shigella", "gastroenteritis"]) {
      expect(subs.some((s) => (s ?? "").includes(bad))).toBe(false);
    }
  });

  it("keeps the wrapped bullet content in the header's fullText", () => {
    const pancreas = leaves.find((r) => r.subdomain === "Disorders of the pancreas");
    expect(pancreas?.fullText).toContain("Shigella species");
    expect(pancreas?.fullText).toContain("pancreatitis, acute");
  });

  it("reconstructs a split vitamin subscript instead of a bare 'B' leaf", () => {
    expect(subs).not.toContain("B");
    const nutr = leaves.find((r) => r.subdomain === "Nutritional disorders");
    expect(nutr?.fullText).toContain("vitamin B1");
    expect(nutr?.fullText).toContain("vitamin B3");
  });
});

describe("parseUsmleOutlineText — real PDF is well-formed (U1)", () => {
  it("yields clean leaf labels and far fewer than the old ~599 over-split leaves", async () => {
    const parsed = await pdf(
      readFileSync(
        path.join(__dirname, "../../data/frameworks/usmle-content-outline-2025.pdf"),
      ),
    );
    const rows = parseUsmleOutlineText(parsed.text);
    const leaves = rows.filter((r) => r.parentStableId);

    // A clean parse yields ~150 leaves — well below the old over-split ~599,
    // above a sane floor. The exact number is an implementation fact, not the
    // ~180–230 the plan estimated before the parser was fixed.
    expect(leaves.length).toBeGreaterThan(100);
    expect(leaves.length).toBeLessThan(260);

    for (const r of leaves) {
      const s = (r.subdomain ?? "").trim();
      expect(s.length).toBeGreaterThanOrEqual(4); // no stray "B" subscript leaf
      expect(s).toMatch(/^[A-Z]/); // starts uppercase
      expect(s).not.toMatch(/[,;:(/-]$/); // not ending mid-phrase
      let depth = 0;
      let underflow = false;
      for (const ch of s) {
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth < 0) underflow = true;
        }
      }
      expect(underflow).toBe(false);
      expect(depth).toBe(0); // balanced parentheses
    }

    const subs = leaves.map((r) => r.subdomain);
    for (const h of [
      "Neoplasms",
      "Thyroid disorders",
      "Disorders of the pancreas",
      "Prenatal care",
      "Multiple endocrine neoplasia (MEN1, MEN2)",
    ]) {
      expect(subs).toContain(h);
    }
    // The confusing metastatic-neoplasms ":pancreas" fragment is gone; the real
    // pancreatitis topic lives under "Disorders of the pancreas".
    expect(subs).not.toContain("pancreas");
  }, 30_000);
});

describe("loadAamcPcrsCatalog (U6 real framework data)", () => {
  const rows = loadAamcPcrsCatalog(
    path.join(__dirname, "../../data/frameworks"),
  );

  it("loads the full official 2013 PCRS: 8 domains, 58 competencies", () => {
    const competencies = rows.filter((r) => r.domain !== "EPA");
    const domains = new Set(competencies.map((r) => r.domain));
    expect(domains.size).toBe(8);
    expect(competencies).toHaveLength(58);
  });

  it("loads all 13 Core EPAs", () => {
    const epas = rows.filter((r) => r.domain === "EPA");
    expect(epas).toHaveLength(13);
    expect(epas.map((e) => e.stableId)).toContain("aamc:epa1");
    expect(epas.map((e) => e.stableId)).toContain("aamc:epa13");
  });

  it("has no stub text and non-empty fullText for every row", () => {
    for (const r of rows) {
      expect(r.fullText.trim().length).toBeGreaterThan(0);
      expect(r.fullText.toLowerCase()).not.toContain("stub");
      expect(r.sourceDoc).not.toContain("stub");
    }
  });

  it("keeps every stable id within varchar(80)", () => {
    for (const r of rows) {
      expect(r.stableId.length).toBeLessThanOrEqual(80);
      if (r.parentStableId) expect(r.parentStableId.length).toBeLessThanOrEqual(80);
    }
  });

  it("carries edition provenance in sourceDoc", () => {
    const pc1 = rows.find((r) => r.stableId === "aamc:pc1");
    expect(pc1?.sourceDoc).toContain("pcrs");
    expect(pc1?.fullText).toContain("Patient Care");
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
