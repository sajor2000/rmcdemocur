import { sql } from "drizzle-orm";
import { getDb } from "./db";

export type FrameworkEmbedTable =
  | "usmle_domains"
  | "aamc_competencies"
  | "aamc_keywords";

const COUNT_QUERIES: Record<FrameworkEmbedTable, ReturnType<typeof sql>> = {
  usmle_domains: sql`
    SELECT COUNT(*)::int AS cnt FROM usmle_domains WHERE embedding IS NOT NULL
  `,
  aamc_competencies: sql`
    SELECT COUNT(*)::int AS cnt FROM aamc_competencies WHERE embedding IS NOT NULL
  `,
  aamc_keywords: sql`
    SELECT COUNT(*)::int AS cnt FROM aamc_keywords WHERE embedding IS NOT NULL
  `,
};

export async function countFrameworkEmbeddings(
  table: FrameworkEmbedTable,
): Promise<number> {
  const db = getDb();
  const result = await db.execute(COUNT_QUERIES[table]);
  return Number((result.rows[0] as { cnt: number })?.cnt ?? 0);
}
