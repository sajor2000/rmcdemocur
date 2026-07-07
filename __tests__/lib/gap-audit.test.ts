import { describe, expect, it } from "vitest";
import { matchedKeywords, nodeKeywords, rankGapCandidates } from "@/lib/gap-audit";

describe("nodeKeywords (U3)", () => {
  it("extracts distinctive keywords and drops generic/short tokens", () => {
    const kws = nodeKeywords({
      subdomain: "Disorders of the pancreas",
      fullText: "pancreatitis, acute; pancreatitis, chronic; pancreatic cyst/pseudocyst",
    });
    expect(kws).toContain("pancreatitis");
    expect(kws).toContain("pancreatic");
    expect(kws).toContain("pseudocyst");
    // generic + short tokens dropped
    expect(kws).not.toContain("acute");
    expect(kws).not.toContain("chronic");
    expect(kws).not.toContain("cyst");
    expect(kws).not.toContain("the");
  });

  it("handles empty fullText by falling back to the subdomain", () => {
    expect(nodeKeywords({ subdomain: "pancreatic insufficiency", fullText: null })).toContain("pancreatic");
  });
});

describe("matchedKeywords (U3)", () => {
  it("matches whole words only", () => {
    expect(matchedKeywords(["pancreatitis"], "The patient has acute pancreatitis.")).toEqual(["pancreatitis"]);
    // "pancrea" should not match as a substring of a keyword search
    expect(matchedKeywords(["pancreas"], "pancreatitis without the organ named")).toEqual([]);
  });
});

describe("rankGapCandidates (U3)", () => {
  const gapNodes = [
    {
      stableId: "usmle:gastrointestinal-system:disorders-of-the-pancreas",
      system: "Gastrointestinal System",
      topic: "Gastrointestinal System — Disorders of the pancreas",
      subdomain: "Disorders of the pancreas",
      fullText: "pancreatitis, acute; pancreatitis, chronic",
    },
    {
      stableId: "usmle:endocrine-system:multiple-endocrine-neoplasia-men1-men2",
      system: "Endocrine System",
      topic: "Endocrine System — Multiple endocrine neoplasia (MEN1, MEN2)",
      subdomain: "Multiple endocrine neoplasia (MEN1, MEN2)",
      fullText: "",
    },
  ];
  const chunks = [
    { id: 10, documentId: 2, content: "Jessica presents with abdominal pain; labs confirm pancreatitis." },
    { id: 11, documentId: 2, content: "Nutritional counseling and follow-up." },
  ];

  it("flags the pancreas node as a likely false negative (pancreatitis present)", () => {
    const ranked = rankGapCandidates(gapNodes, chunks);
    expect(ranked.length).toBe(1);
    expect(ranked[0].stableId).toBe("usmle:gastrointestinal-system:disorders-of-the-pancreas");
    expect(ranked[0].hits).toContain("pancreatitis");
    expect(ranked[0].chunkId).toBe(10);
    expect(ranked[0].excerpt.toLowerCase()).toContain("pancreatitis");
  });

  it("does not flag a node with no lexical signal in any chunk (MEN)", () => {
    const ranked = rankGapCandidates(gapNodes, chunks);
    expect(ranked.find((c) => c.stableId.includes("multiple-endocrine-neoplasia"))).toBeUndefined();
  });
});
