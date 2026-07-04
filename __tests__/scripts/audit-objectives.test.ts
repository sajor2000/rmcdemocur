import { describe, expect, it } from "vitest";
import { objectiveGateFailures, type ObjectiveAuditRow } from "../../scripts/audit-objectives";

const row = (o: Partial<ObjectiveAuditRow>): ObjectiveAuditRow => ({
  file: "f.docx",
  isSelfStudy: true,
  objectives: 3,
  toCoded: 0,
  ...o,
});

describe("objectiveGateFailures", () => {
  it("passes when every self-study guide has objectives", () => {
    expect(
      objectiveGateFailures([
        row({ file: "SelfStudy_1.docx", objectives: 5 }),
        row({ file: "SelfStudy_2.docx", objectives: 1 }),
      ]),
    ).toEqual([]);
  });

  it("fails a self-study guide with zero objectives", () => {
    const failures = objectiveGateFailures([
      row({ file: "SelfStudy_3.docx", objectives: 0 }),
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("SelfStudy_3.docx");
  });

  it("does not fail a faculty guide with zero objectives (warning-only)", () => {
    expect(
      objectiveGateFailures([
        row({ file: "FacultyGuide_1.pdf", isSelfStudy: false, objectives: 0 }),
      ]),
    ).toEqual([]);
  });
});
