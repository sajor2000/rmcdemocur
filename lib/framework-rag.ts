import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import type { FrameworkCandidate } from "@/lib/framework-catalog";

const DEFAULT_K = 20;

export async function retrieveUsmleCandidates(
  chunkEmbedding: number[],
  k = DEFAULT_K,
): Promise<FrameworkCandidate[]> {
  if (!chunkEmbedding.length) {
    throw new Error("chunkEmbedding is required for framework retrieval");
  }
  const db = getDb();
  const vec = `[${chunkEmbedding.join(",")}]`;
  const rows = await db.execute(sql`
    SELECT stable_id, domain, subdomain, full_text
    FROM usmle_domains
    WHERE embedding IS NOT NULL AND subdomain IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${k}
  `);

  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    stableId: String(r.stable_id),
    label: `${r.domain}${r.subdomain ? ` — ${r.subdomain}` : ""}`,
    description: String(r.full_text ?? r.description ?? "").slice(0, 500),
  }));
}

export async function retrieveAamcCandidates(
  chunkEmbedding: number[],
  k = DEFAULT_K,
): Promise<FrameworkCandidate[]> {
  if (!chunkEmbedding.length) {
    throw new Error("chunkEmbedding is required for framework retrieval");
  }
  const db = getDb();
  const vec = `[${chunkEmbedding.join(",")}]`;
  const rows = await db.execute(sql`
    SELECT stable_id, sub_id, domain_name, description, full_text,
           embedding <=> ${vec}::vector AS distance
    FROM aamc_competencies
    WHERE embedding IS NOT NULL
    ORDER BY distance
    LIMIT ${k}
  `);

  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    stableId: String(r.stable_id ?? r.sub_id),
    label: `${r.sub_id}: ${r.domain_name} — ${r.description}`,
    description: String(r.full_text ?? r.description ?? "").slice(0, 500),
  }));
}

export async function retrieveKeywordCandidates(
  chunkEmbedding: number[],
  k = 10,
): Promise<{ stableId: string; keyword: string; definition: string }[]> {
  const db = getDb();
  const vec = `[${chunkEmbedding.join(",")}]`;
  const rows = await db.execute(sql`
    SELECT stable_id, keyword, definition
    FROM aamc_keywords
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${k}
  `);

  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    stableId: String(r.stable_id),
    keyword: String(r.keyword),
    definition: String(r.definition ?? ""),
  }));
}

/** Text overlap fallback when framework embeddings are unavailable. */
export async function listUsmleCatalogCandidates(
  chunkText: string,
  k = DEFAULT_K,
): Promise<FrameworkCandidate[]> {
  const db = getDb();
  const terms = chunkText
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4)
    .slice(0, 12);

  if (terms.length === 0) {
    const rows = await db.execute(sql`
      SELECT stable_id, domain, subdomain, full_text
      FROM usmle_domains
      WHERE subdomain IS NOT NULL
      ORDER BY stable_id
      LIMIT ${k}
    `);
    return mapUsmleRows(rows.rows as Record<string, unknown>[]);
  }

  const pattern = `%${terms[0]}%`;
  const rows = await db.execute(sql`
    SELECT stable_id, domain, subdomain, full_text
    FROM usmle_domains
    WHERE subdomain IS NOT NULL
      AND LOWER(COALESCE(full_text, '') || ' ' || domain || ' ' || subdomain) LIKE ${pattern}
    ORDER BY stable_id
    LIMIT ${k}
  `);
  const mapped = mapUsmleRows(rows.rows as Record<string, unknown>[]);
  if (mapped.length > 0) return mapped;

  const fallback = await db.execute(sql`
    SELECT stable_id, domain, subdomain, full_text
    FROM usmle_domains
    WHERE subdomain IS NOT NULL
    ORDER BY stable_id
    LIMIT ${k}
  `);
  return mapUsmleRows(fallback.rows as Record<string, unknown>[]);
}

export async function listAamcCatalogCandidates(
  chunkText: string,
  k = DEFAULT_K,
): Promise<FrameworkCandidate[]> {
  const db = getDb();
  const terms = chunkText
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4)
    .slice(0, 12);

  const pattern = terms.length ? `%${terms[0]}%` : "%";
  const rows = await db.execute(sql`
    SELECT stable_id, sub_id, domain_name, description, full_text
    FROM aamc_competencies
    WHERE LOWER(COALESCE(full_text, '') || ' ' || COALESCE(description, '')) LIKE ${pattern}
    ORDER BY stable_id
    LIMIT ${k}
  `);
  const mapped = mapAamcRows(rows.rows as Record<string, unknown>[]);
  if (mapped.length > 0) return mapped;

  const fallback = await db.execute(sql`
    SELECT stable_id, sub_id, domain_name, description, full_text
    FROM aamc_competencies
    ORDER BY stable_id
    LIMIT ${k}
  `);
  return mapAamcRows(fallback.rows as Record<string, unknown>[]);
}

function mapUsmleRows(rows: Record<string, unknown>[]): FrameworkCandidate[] {
  return rows.map((r) => ({
    stableId: String(r.stable_id),
    label: `${r.domain}${r.subdomain ? ` — ${r.subdomain}` : ""}`,
    description: String(r.full_text ?? "").slice(0, 500),
  }));
}

function mapAamcRows(rows: Record<string, unknown>[]): FrameworkCandidate[] {
  return rows.map((r) => ({
    stableId: String(r.stable_id ?? r.sub_id),
    label: `${r.sub_id}: ${r.domain_name} — ${r.description}`,
    description: String(r.full_text ?? r.description ?? "").slice(0, 500),
  }));
}

export async function resolveFrameworkCandidates(
  framework: "AAMC" | "USMLE",
  chunkText: string,
  chunkEmbedding?: number[],
): Promise<FrameworkCandidate[]> {
  if (chunkEmbedding?.length) {
    try {
      const vectorHits =
        framework === "AAMC"
          ? await retrieveAamcCandidates(chunkEmbedding)
          : await retrieveUsmleCandidates(chunkEmbedding);
      if (vectorHits.length > 0) return vectorHits;
    } catch {
      // fall through to catalog text match
    }
  }

  return framework === "AAMC"
    ? listAamcCatalogCandidates(chunkText)
    : listUsmleCatalogCandidates(chunkText);
}
