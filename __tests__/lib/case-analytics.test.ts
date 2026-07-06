import { describe, expect, it } from "vitest";
import { distribution } from "@/lib/coverage";
import {
  aggregateAlignmentStatsByDocuments,
  buildCaseLensMetrics,
  buildCourseHeatmap,
  buildDomainsTotalBySystem,
  buildHeatmapForDocumentLens,
  countObjectivesForDocuments,
  dedupeCaseList,
  documentIdsForLens,
  filterHeatmapForCase,
  rollupFrameworkDocCounts,
  rollupTopTopicsForDocuments,
} from "@/lib/queries";

describe("filterHeatmapForCase", () => {
  it("returns only rows for the requested case", () => {
    const heatmap = buildCourseHeatmap(
      [
        { case_number: 1, system: "Gastrointestinal System", domains_touched: 4 },
        { case_number: 2, system: "Gastrointestinal System", domains_touched: 2 },
      ],
      new Map([["Gastrointestinal System", 6]]),
    );
    expect(filterHeatmapForCase(heatmap, 2)).toEqual([
      { system: "Gastrointestinal System", status: "partial" },
    ]);
  });

  it("returns empty when case has no heatmap rows", () => {
    expect(filterHeatmapForCase([], 3)).toEqual([]);
  });
});

describe("dedupeCaseList", () => {
  it("keeps one row per case_number preferring faculty guide title", () => {
    const docs = [
      {
        id: 1,
        caseNumber: 1,
        caseTitle: "David Tilo (Self-Study)",
        filename: "Case1_SelfStudy.docx",
      },
      {
        id: 2,
        caseNumber: 1,
        caseTitle: "David Tilo",
        filename: "Case1_FacultyGuide.pdf",
      },
      {
        id: 3,
        caseNumber: 2,
        caseTitle: "Jessica Donner",
        filename: "Case2_FacultyGuide.pdf",
      },
    ];
    const result = dedupeCaseList(docs);
    expect(result).toHaveLength(2);
    expect(result[0].caseTitle).toBe("David Tilo");
    expect(result[1].caseNumber).toBe(2);
  });
});

describe("case scope distribution shape", () => {
  it("produces mostly introduced/reinforced for thin doc counts", () => {
    const dist = distribution([1, 2, 0, 1], 10);
    expect(dist.introduced).toBe(2);
    expect(dist.reinforced).toBe(1);
    expect(dist.gap).toBe(7);
  });
});

describe("documentIdsForLens", () => {
  const docs = [
    { id: 1, guideKind: "faculty" as const },
    { id: 2, guideKind: "self_study" as const },
  ];

  it("returns all ids for all lens", () => {
    expect(documentIdsForLens(docs, "all")).toEqual([1, 2]);
  });

  it("returns faculty id only for faculty lens", () => {
    expect(documentIdsForLens(docs, "faculty")).toEqual([1]);
  });
});

describe("countObjectivesForDocuments", () => {
  const rows = [
    {
      document: { id: 1, caseNumber: 2 },
      objective: { extractionMethod: "regex" },
    },
    {
      document: { id: 2, caseNumber: 2 },
      objective: { extractionMethod: "llm_cleanup" },
    },
    {
      document: { id: 3, caseNumber: 3 },
      objective: { extractionMethod: "regex" },
    },
  ];

  it("counts objectives for case and document subset", () => {
    expect(countObjectivesForDocuments(rows, 2, new Set([1]))).toEqual({
      total: 1,
      regex: 1,
      llm: 0,
    });
    expect(countObjectivesForDocuments(rows, 2, new Set([1, 2]))).toEqual({
      total: 2,
      regex: 1,
      llm: 1,
    });
  });
});

describe("aggregateAlignmentStatsByDocuments", () => {
  it("sums alignment stats across selected documents", () => {
    const rows = [
      { document_id: 1, total: 10, reviewed: 2, avg_confidence: "0.8" },
      { document_id: 2, total: 5, reviewed: 1, avg_confidence: "0.6" },
    ];
    expect(aggregateAlignmentStatsByDocuments(rows, new Set([1]))).toEqual({
      total: 10,
      reviewed: 2,
      avgConfidence: 0.8,
    });
    expect(aggregateAlignmentStatsByDocuments(rows, new Set([1, 2]))).toEqual({
      total: 15,
      reviewed: 3,
      avgConfidence: (0.8 * 10 + 0.6 * 5) / 15,
    });
  });
});

describe("rollupFrameworkDocCounts", () => {
  it("counts distinct documents per framework in the lens", () => {
    const rows = [
      { framework_id: "u1", document_id: 1 },
      { framework_id: "u1", document_id: 2 },
      { framework_id: "u2", document_id: 1 },
    ];
    expect(rollupFrameworkDocCounts(rows, new Set([1]))).toEqual([1, 1]);
    expect(rollupFrameworkDocCounts(rows, new Set([1, 2]))).toEqual([2, 1]);
  });
});

describe("rollupTopTopicsForDocuments", () => {
  it("merges chunk counts per framework across documents in lens", () => {
    const rows = [
      {
        framework_id: "u1",
        label: "Topic A",
        framework: "USMLE",
        document_id: 1,
        chunks: 3,
      },
      {
        framework_id: "u1",
        label: "Topic A",
        framework: "USMLE",
        document_id: 2,
        chunks: 2,
      },
    ];
    expect(rollupTopTopicsForDocuments(rows, new Set([1]), 8)).toEqual([
      { label: "Topic A", framework: "USMLE", chunks: 3 },
    ]);
    expect(rollupTopTopicsForDocuments(rows, new Set([1, 2]), 8)).toEqual([
      { label: "Topic A", framework: "USMLE", chunks: 5 },
    ]);
  });
});

describe("buildHeatmapForDocumentLens", () => {
  it("buckets distinct frameworks per system for a document subset", () => {
    const rows = [
      { document_id: 1, system: "GI", framework_id: "a" },
      { document_id: 1, system: "GI", framework_id: "b" },
      { document_id: 2, system: "GI", framework_id: "c" },
    ];
    const result = buildHeatmapForDocumentLens(
      rows,
      new Set([1]),
      new Map([["GI", 10]]),
    );
    expect(result).toEqual([{ system: "GI", status: "partial" }]);
  });
});

describe("buildCaseLensMetrics", () => {
  const docs = [
    { id: 1, guideKind: "faculty" as const },
    { id: 2, guideKind: "self_study" as const },
  ];

  const baseInputs = {
    objectiveRows: [
      { document: { id: 1, caseNumber: 2 }, objective: { extractionMethod: "regex" } },
      { document: { id: 2, caseNumber: 2 }, objective: { extractionMethod: "regex" } },
    ],
    caseNumber: 2,
    alignRows: [
      { document_id: 1, total: 4, reviewed: 1, avg_confidence: "0.7" },
      { document_id: 2, total: 6, reviewed: 2, avg_confidence: "0.9" },
    ],
    usmleFrameworkRows: [
      { framework_id: "u1", document_id: 1 },
      { framework_id: "u2", document_id: 2 },
    ],
    aamcFrameworkRows: [{ framework_id: "a1", document_id: 1 }],
    topTopicRows: [
      {
        framework_id: "u1",
        label: "Topic",
        framework: "USMLE",
        document_id: 1,
        chunks: 2,
      },
    ],
    heatmapFrameworkRows: [
      { document_id: 1, system: "GI", framework_id: "u1" },
      { document_id: 2, system: "GI", framework_id: "u2" },
    ],
    allLensHeatmap: [{ system: "GI", status: "covered" as const }],
    domainsTotalBySystem: new Map([["GI", 5]]),
    usmleTotal: 10,
    aamcTotal: 20,
  };

  it("all lens uses dashboard heatmap row", () => {
    const all = buildCaseLensMetrics("all", docs, baseInputs);
    expect(all.objectives.total).toBe(2);
    expect(all.heatmap).toEqual(baseInputs.allLensHeatmap);
  });

  it("faculty lens is a strict subset of all", () => {
    const faculty = buildCaseLensMetrics("faculty", docs, baseInputs);
    expect(faculty.objectives.total).toBe(1);
    expect(faculty.alignments.total).toBe(4);
  });
});

describe("filterHeatmapForCase parity (AE3)", () => {
  it("matches a single case row from buildCourseHeatmap", () => {
    const rows = [
      { case_number: 2, system: "Gastrointestinal System", domains_touched: 3 },
      { case_number: 1, system: "Gastrointestinal System", domains_touched: 5 },
    ];
    const totals = new Map([["Gastrointestinal System", 8]]);
    const full = buildCourseHeatmap(rows, totals);
    expect(filterHeatmapForCase(full, 2)).toEqual([
      { system: "Gastrointestinal System", status: "partial" },
    ]);
  });
});

describe("buildDomainsTotalBySystem", () => {
  it("scopes systems when course has organ target list", () => {
    const map = buildDomainsTotalBySystem(
      [
        { system: "GI", total: 10 },
        { system: "Renal", total: 5 },
      ],
      ["GI"],
    );
    expect(map.get("GI")).toBe(10);
    expect(map.has("Renal")).toBe(false);
  });
});
