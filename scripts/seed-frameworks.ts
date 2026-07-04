import "./load-env";
import fs from "fs/promises";
import path from "path";
import { eq, isNotNull, sql } from "drizzle-orm";
import {
  aamcCompetencies,
  aamcKeywords,
  usmleDomains,
} from "../drizzle/schema";
import {
  CheckpointTimer,
  loadBootstrapState,
  maybeCheckpoint,
  saveBootstrapState,
  type BootstrapState,
} from "../lib/bootstrap-state";
import {
  appendCachedEmbedding,
  loadEmbeddingCache,
} from "../lib/embedding-cache";
import { getDb } from "../lib/db";
import { generateEmbedding } from "../lib/azure-ai";
import { parseAllFrameworkSources } from "../lib/framework-parsers";

const FRAMEWORKS_DIR = path.join(process.cwd(), "data/frameworks");
const PARSED_DIR = path.join(FRAMEWORKS_DIR, "parsed");
const USMLE_STABLE_ID_MAX = 120;
const EMBED_TEXT_MAX = 8000;

/**
 * Collapse USMLE rows sharing a stableId, keeping the first occurrence. The
 * seed loop upserts each row keyed by stableId, so duplicates in the parsed
 * bundle map to a single DB row (first wins). Deduping here makes the bundle
 * length match the insertable-row count, so `frameworks.usmle.total` equals the
 * number that can actually embed — otherwise `complete` (embedded >= total)
 * never reads true (the 612/614 false-negative).
 */
export function dedupeUsmleByStableId<T extends { stableId: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.stableId)) continue;
    seen.add(row.stableId);
    out.push(row);
  }
  return out;
}

export function assertUsmleStableIdLengths(
  rows: { stableId: string; parentStableId: string | null }[],
) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.stableId.length > USMLE_STABLE_ID_MAX) {
      throw new Error(
        `USMLE row ${i} stableId exceeds ${USMLE_STABLE_ID_MAX} chars: ${row.stableId.slice(0, 80)}…`,
      );
    }
    if (
      row.parentStableId &&
      row.parentStableId.length > USMLE_STABLE_ID_MAX
    ) {
      throw new Error(
        `USMLE row ${i} parentStableId exceeds ${USMLE_STABLE_ID_MAX} chars`,
      );
    }
  }
}

function hasAzureEmbeddingConfig(): boolean {
  return (
    Boolean(process.env.AZURE_OPENAI_ENDPOINT) &&
    Boolean(process.env.AZURE_OPENAI_API_KEY) &&
    Boolean(process.env.AZURE_OPENAI_DEPLOYMENT_EMBED)
  );
}

function requireAzureForEmbeddings(skipEmbeddings?: boolean) {
  if (skipEmbeddings) return;
  if (!hasAzureEmbeddingConfig()) {
    throw new Error(
      "Azure OpenAI embedding credentials are required for db:seed-frameworks. " +
        "Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT_EMBED, " +
        "or pass --skip-embeddings for a metadata-only seed.",
    );
  }
}

type SeedContext = {
  skipEmbeddings?: boolean;
  trackBootstrap?: boolean;
  state?: BootstrapState;
  timer?: CheckpointTimer;
  cache: Map<string, number[]>;
};

async function resolveEmbedding(
  ctx: SeedContext,
  stableId: string,
  text: string,
): Promise<number[] | null> {
  if (ctx.skipEmbeddings || !text.trim()) return null;

  const cached = ctx.cache.get(stableId);
  if (cached) return cached;

  const vector = await generateEmbedding(text.slice(0, EMBED_TEXT_MAX));
  ctx.cache.set(stableId, vector);
  await appendCachedEmbedding(stableId, vector, ctx.cache);
  return vector;
}

async function countEmbedded(table: "usmle" | "aamc" | "keywords"): Promise<number> {
  const db = getDb();
  if (table === "usmle") {
    const rows = await db
      .select({ stableId: usmleDomains.stableId })
      .from(usmleDomains)
      .where(isNotNull(usmleDomains.embedding));
    return rows.length;
  }
  if (table === "aamc") {
    const rows = await db
      .select({ stableId: aamcCompetencies.stableId })
      .from(aamcCompetencies)
      .where(isNotNull(aamcCompetencies.embedding));
    return rows.length;
  }
  const rows = await db
    .select({ stableId: aamcKeywords.stableId })
    .from(aamcKeywords)
    .where(isNotNull(aamcKeywords.embedding));
  return rows.length;
}

async function reportProgress(
  ctx: SeedContext,
  key: keyof BootstrapState["frameworks"],
  embedded: number,
  total: number,
  label: string,
) {
  if (!ctx.state || !ctx.timer) return;
  ctx.state.phase = "frameworks";
  ctx.state.frameworks[key] = {
    embedded,
    total,
    complete: total > 0 && embedded >= total,
  };
  await maybeCheckpoint(ctx.timer, ctx.state, label);
}

async function seedUsmle(
  rows: Awaited<ReturnType<typeof parseAllFrameworkSources>>["usmle"],
  ctx: SeedContext,
) {
  const db = getDb();
  let embedded = await countEmbedded("usmle");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const [existing] = await db
      .select()
      .from(usmleDomains)
      .where(eq(usmleDomains.stableId, row.stableId))
      .limit(1);

    if (existing?.embedding) continue;

    const embedding = await resolveEmbedding(
      ctx,
      row.stableId,
      row.fullText || row.domain,
    );

    const values = {
      step: row.step,
      category: row.category,
      domain: row.domain,
      subdomain: row.subdomain,
      stableId: row.stableId,
      fullText: row.fullText,
      parentStableId: row.parentStableId,
      sourceDoc: row.sourceDoc,
      embedding: embedding ?? undefined,
    };

    if (existing) {
      await db.update(usmleDomains).set(values).where(eq(usmleDomains.id, existing.id));
    } else {
      await db.insert(usmleDomains).values(values);
    }

    if (embedding) embedded++;
    if ((i + 1) % 10 === 0 || i === rows.length - 1) {
      console.log(`USMLE ${i + 1}/${rows.length} (${embedded} embedded)`);
    }
    await reportProgress(ctx, "usmle", embedded, rows.length, `frameworks usmle ${i + 1}/${rows.length}`);
  }

  return { embedded, total: rows.length };
}

async function seedAamc(
  rows: Awaited<ReturnType<typeof parseAllFrameworkSources>>["aamcCompetencies"],
  ctx: SeedContext,
) {
  const db = getDb();
  let embedded = await countEmbedded("aamc");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const [existing] = await db
      .select()
      .from(aamcCompetencies)
      .where(eq(aamcCompetencies.stableId, row.stableId))
      .limit(1);

    if (existing?.embedding) continue;

    const embedding = await resolveEmbedding(ctx, row.stableId, row.fullText);
    const values = {
      domain: row.domain,
      domainName: row.domainName,
      subId: row.subId,
      description: row.description,
      stableId: row.stableId,
      fullText: row.fullText,
      parentStableId: row.parentStableId,
      sourceDoc: row.sourceDoc,
      embedding: embedding ?? undefined,
    };

    if (existing) {
      await db
        .update(aamcCompetencies)
        .set(values)
        .where(eq(aamcCompetencies.id, existing.id));
    } else {
      await db.insert(aamcCompetencies).values(values);
    }

    if (embedding) embedded++;
    console.log(`AAMC ${i + 1}/${rows.length}`);
    await reportProgress(ctx, "aamc", embedded, rows.length, `frameworks aamc ${i + 1}/${rows.length}`);
  }

  return { embedded, total: rows.length };
}

async function seedKeywords(
  rows: Awaited<ReturnType<typeof parseAllFrameworkSources>>["aamcKeywords"],
  ctx: SeedContext,
) {
  const db = getDb();
  let embedded = await countEmbedded("keywords");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const [existing] = await db
      .select()
      .from(aamcKeywords)
      .where(eq(aamcKeywords.stableId, row.stableId))
      .limit(1);

    if (existing?.embedding) continue;

    const text = `${row.keyword}. ${row.definition}`.slice(0, EMBED_TEXT_MAX);
    const embedding = await resolveEmbedding(ctx, row.stableId, text);
    const values = {
      keywordId: row.keywordId,
      keyword: row.keyword,
      definition: row.definition,
      synonyms: row.synonyms,
      stableId: row.stableId,
      embedding: embedding ?? undefined,
    };

    if (existing) {
      await db.update(aamcKeywords).set(values).where(eq(aamcKeywords.id, existing.id));
    } else {
      await db.insert(aamcKeywords).values(values);
    }

    if (embedding) embedded++;
    if ((i + 1) % 10 === 0 || i === rows.length - 1) {
      console.log(`Keywords ${i + 1}/${rows.length}`);
    }
    await reportProgress(
      ctx,
      "keywords",
      embedded,
      rows.length,
      `frameworks keywords ${i + 1}/${rows.length}`,
    );
  }

  return { embedded, total: rows.length };
}

export async function seedFrameworks(options?: {
  skipEmbeddings?: boolean;
  trackBootstrap?: boolean;
}) {
  requireAzureForEmbeddings(options?.skipEmbeddings);

  const db = getDb();
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  const bundle = await parseAllFrameworkSources(FRAMEWORKS_DIR);
  // Dedupe before totals/asserts so `total` matches the insertable-row count.
  bundle.usmle = dedupeUsmleByStableId(bundle.usmle);
  assertUsmleStableIdLengths(bundle.usmle);

  await fs.mkdir(PARSED_DIR, { recursive: true });
  await fs.writeFile(
    path.join(PARSED_DIR, "usmle-2025.json"),
    JSON.stringify(bundle.usmle, null, 2),
  );
  await fs.writeFile(
    path.join(PARSED_DIR, "aamc-keywords.json"),
    JSON.stringify(bundle.aamcKeywords, null, 2),
  );
  await fs.writeFile(
    path.join(PARSED_DIR, "aamc-competencies.json"),
    JSON.stringify(bundle.aamcCompetencies, null, 2),
  );

  const state = options?.trackBootstrap ? await loadBootstrapState() : undefined;
  const timer = options?.trackBootstrap ? new CheckpointTimer() : undefined;
  const ctx: SeedContext = {
    skipEmbeddings: options?.skipEmbeddings,
    trackBootstrap: options?.trackBootstrap,
    state,
    timer,
    cache: await loadEmbeddingCache(),
  };

  if (state) {
    state.phase = "frameworks";
    state.frameworks.usmle.total = bundle.usmle.length;
    state.frameworks.aamc.total = bundle.aamcCompetencies.length;
    state.frameworks.keywords.total = bundle.aamcKeywords.length;
    await saveBootstrapState(state);
  }

  const usmle = await seedUsmle(bundle.usmle, ctx);
  const aamc = await seedAamc(bundle.aamcCompetencies, ctx);
  const keywords = await seedKeywords(bundle.aamcKeywords, ctx);

  if (state) {
    state.frameworks.usmle = {
      ...usmle,
      complete: usmle.embedded >= usmle.total && usmle.total > 0,
    };
    state.frameworks.aamc = {
      ...aamc,
      complete: aamc.embedded >= aamc.total && aamc.total > 0,
    };
    state.frameworks.keywords = {
      ...keywords,
      complete: keywords.embedded >= keywords.total && keywords.total > 0,
    };
    await saveBootstrapState(state);
  }

  console.log(
    `Seeded ${bundle.usmle.length} USMLE, ${bundle.aamcCompetencies.length} AAMC competencies, ${bundle.aamcKeywords.length} keywords (${usmle.embedded}/${usmle.total} USMLE embedded).`,
  );
}

async function main() {
  const skipEmbeddings = process.argv.includes("--skip-embeddings");
  const trackBootstrap = process.argv.includes("--track-bootstrap");
  await seedFrameworks({ skipEmbeddings, trackBootstrap });
}

const isCli = path.basename(process.argv[1] ?? "") === "seed-frameworks.ts";
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
