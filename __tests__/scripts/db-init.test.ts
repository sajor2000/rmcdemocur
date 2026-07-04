import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.hoisted(() => vi.fn());
vi.mock("@neondatabase/serverless", () => ({ neon: () => sqlMock }));
vi.mock("./load-env", () => ({}));

import { directUrl, pushSchema } from "@/scripts/db-init";

describe("directUrl", () => {
  it("strips the pooler suffix from DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgres://user:pass@ep-foo-pooler.us-east-1.aws.neon.tech/db";
    expect(directUrl()).toBe("postgres://user:pass@ep-foo.us-east-1.aws.neon.tech/db");
  });

  it("throws when DATABASE_URL is not set", () => {
    delete process.env.DATABASE_URL;
    expect(() => directUrl()).toThrow(/DATABASE_URL is not set/);
  });
});

describe("pushSchema", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://user:pass@ep-foo.us-east-1.aws.neon.tech/db";
    sqlMock.mockReset();
  });

  it("creates the media_assets_key_idx index when no duplicates exist", async () => {
    sqlMock.mockImplementation((query: string) => {
      if (query.includes("GROUP BY document_id, label, reference_kind")) return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    await pushSchema();

    const indexCall = sqlMock.mock.calls.find(([q]) => q.includes("media_assets_key_idx"));
    expect(indexCall).toBeDefined();
  });

  it("fails loudly instead of silently skipping index creation when duplicates remain", async () => {
    sqlMock.mockImplementation((query: string) => {
      if (query.includes("GROUP BY document_id, label, reference_kind")) return Promise.resolve([{}]);
      return Promise.resolve(undefined);
    });

    await expect(pushSchema()).rejects.toThrow(/collapse-duplicate-media/);

    const indexCall = sqlMock.mock.calls.find(([q]) => q.includes("media_assets_key_idx"));
    expect(indexCall).toBeUndefined();
  });
});
