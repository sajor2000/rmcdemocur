import { describe, expect, it } from "vitest";
import { DEMO_DOCUMENTS } from "../../scripts/seed";
import { SAMPLE_CASES } from "@/lib/demo-data";

describe("case diagnoses (U1)", () => {
  it("labels Case 3 (Marie Hernandez) as glutaric acidemia, not bacterial meningitis", () => {
    const case3 = DEMO_DOCUMENTS.filter((d) => d.caseNumber === 3);
    expect(case3.length).toBeGreaterThan(0);
    for (const doc of case3) {
      expect(doc.diagnosis).toBe("Glutaric acidemia");
    }
    const sample3 = SAMPLE_CASES.find((c) => c.caseNumber === 3);
    expect(sample3?.diagnosis).toBe("Glutaric acidemia");
  });

  it("carries no bacterial-meningitis label anywhere in seed or sample data", () => {
    for (const doc of DEMO_DOCUMENTS) {
      expect(doc.diagnosis.toLowerCase()).not.toContain("meningitis");
    }
    for (const c of SAMPLE_CASES) {
      expect(c.diagnosis.toLowerCase()).not.toContain("meningitis");
    }
  });
});
