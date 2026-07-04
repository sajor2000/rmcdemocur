import { describe, expect, it } from "vitest";
import { groupKeywordsByChunk } from "@/lib/queries";

describe("groupKeywordsByChunk", () => {
  it("groups keyword tags by chunk with definitions", () => {
    const out = groupKeywordsByChunk([
      { chunkId: 1, keyword: "gluconeogenesis", definition: "making glucose" },
      { chunkId: 1, keyword: "glycolysis", definition: "breaking glucose" },
      { chunkId: 2, keyword: "cirrhosis", definition: "liver scarring" },
    ]);
    expect(out[1].map((k) => k.keyword)).toEqual(["gluconeogenesis", "glycolysis"]);
    expect(out[1][0].definition).toBe("making glucose");
    expect(out[2]).toHaveLength(1);
  });

  it("dedupes a repeated keyword within a chunk", () => {
    const out = groupKeywordsByChunk([
      { chunkId: 1, keyword: "insulin", definition: "hormone" },
      { chunkId: 1, keyword: "insulin", definition: "hormone" },
    ]);
    expect(out[1]).toHaveLength(1);
  });

  it("keeps a keyword whose definition is missing (empty def, no crash)", () => {
    const out = groupKeywordsByChunk([
      { chunkId: 3, keyword: "steatosis", definition: null },
    ]);
    expect(out[3][0]).toEqual({ keyword: "steatosis", definition: null });
  });

  it("skips rows with no chunk id or no keyword", () => {
    const out = groupKeywordsByChunk([
      { chunkId: null, keyword: "orphan", definition: "x" },
      { chunkId: 4, keyword: null, definition: "x" },
    ]);
    expect(Object.keys(out)).toHaveLength(0);
  });
});
