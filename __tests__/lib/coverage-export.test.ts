import { describe, expect, it } from "vitest";
import { coverageRowsToCsv, coverageRowsToJson } from "@/lib/coverage-export";

const rows = [
  { framework: "USMLE", system: "Gastrointestinal System", topic: "GI — GERD", docs: 5, courses: 1 },
  { framework: "USMLE", system: "Respiratory System", topic: "Resp — asthma", docs: 0, courses: 0 },
];

describe("coverage export", () => {
  it("CSV leads with the method note, then a header, then leveled rows", () => {
    const lines = coverageRowsToCsv(rows).split("\n");
    expect(lines[0]).toMatch(/^# .*faculty review/i);
    expect(lines[1]).toBe("framework,system,topic,level,documents,courses");
    expect(lines[2]).toContain("Strong"); // 5 docs
    expect(lines[3]).toContain("Not addressed"); // 0-doc gap
  });

  it("escapes quotes and commas in CSV cells", () => {
    const csv = coverageRowsToCsv([
      { framework: "AAMC", system: "PC", topic: 'a, "b"', docs: 2, courses: 1 },
    ]);
    expect(csv).toContain('"a, ""b"""');
  });

  it("JSON carries the method note and a level per topic", () => {
    const j = coverageRowsToJson(rows, "Entire curriculum");
    expect(j.method).toMatch(/faculty review/i);
    expect(j.scope).toBe("Entire curriculum");
    expect(j.topics[0]).toMatchObject({ level: "Strong", docs: 5 });
    expect(j.topics[1].level).toBe("Not addressed");
  });
});
