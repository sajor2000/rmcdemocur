import "./load-env";
import fs from "fs/promises";
import path from "path";
import { sql } from "drizzle-orm";
import {
  aamcCompetencies,
  aamcKeywords,
  usmleDomains,
} from "../drizzle/schema";
import { getDb } from "../lib/db";
import { generateEmbedding } from "../lib/azure-ai";
import { parseAllFrameworkSources } from "../lib/framework-parsers";

const FRAMEWORKS_DIR = path.join(process.cwd(), "data/frameworks");
const PARSED_DIR = path.join(FRAMEWORKS_DIR, "parsed");
const USMLE_STABLE_ID_MAX = 120;

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

async function embedBatch(
  texts: string[],
  batchSize = 10,
): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  const hasAzure = hasAzureEmbeddingConfig();

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    for (const text of batch) {
      if (!hasAzure || !text.trim()) {
        results.push(null);
        continue;
      }
      try {
        results.push(await generateEmbedding(text.slice(0, 8000)));
      } catch (err) {
        console.error("Embedding failed:", err);
        throw err;
      }
    }
    console.log(`Embedded ${Math.min(i + batchSize, texts.length)}/${texts.length}`);
  }
  return results;
}

export async function seedFrameworks(options?: { skipEmbeddings?: boolean }) {
  requireAzureForEmbeddings(options?.skipEmbeddings);

  const db = getDb();
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  const bundle = await parseAllFrameworkSources(FRAMEWORKS_DIR);
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

  const usmleEmbeddings = options?.skipEmbeddings
    ? bundle.usmle.map(() => null)
    : await embedBatch(bundle.usmle.map((r) => r.fullText || r.domain));

  const aamcEmbeddings = options?.skipEmbeddings
    ? bundle.aamcCompetencies.map(() => null)
    : await embedBatch(bundle.aamcCompetencies.map((r) => r.fullText));

  const kwEmbeddings = options?.skipEmbeddings
    ? bundle.aamcKeywords.map(() => null)
    : await embedBatch(
        bundle.aamcKeywords.map(
          (k) => `${k.keyword}. ${k.definition}`.slice(0, 8000),
        ),
      );

  // Wipe only after parse + embeddings succeed so a mid-run failure keeps prior catalog.
  await db.delete(aamcKeywords);
  await db.delete(aamcCompetencies);
  await db.delete(usmleDomains);

  for (let i = 0; i < bundle.usmle.length; i++) {
    const row = bundle.usmle[i];
    await db.insert(usmleDomains).values({
      step: row.step,
      category: row.category,
      domain: row.domain,
      subdomain: row.subdomain,
      stableId: row.stableId,
      fullText: row.fullText,
      parentStableId: row.parentStableId,
      sourceDoc: row.sourceDoc,
      embedding: usmleEmbeddings[i] ?? undefined,
    });
  }

  for (let i = 0; i < bundle.aamcCompetencies.length; i++) {
    const row = bundle.aamcCompetencies[i];
    await db.insert(aamcCompetencies).values({
      domain: row.domain,
      domainName: row.domainName,
      subId: row.subId,
      description: row.description,
      stableId: row.stableId,
      fullText: row.fullText,
      parentStableId: row.parentStableId,
      sourceDoc: row.sourceDoc,
      embedding: aamcEmbeddings[i] ?? undefined,
    });
  }

  for (let i = 0; i < bundle.aamcKeywords.length; i++) {
    const row = bundle.aamcKeywords[i];
    await db.insert(aamcKeywords).values({
      keywordId: row.keywordId,
      keyword: row.keyword,
      definition: row.definition,
      synonyms: row.synonyms,
      stableId: row.stableId,
      embedding: kwEmbeddings[i] ?? undefined,
    });
  }

  console.log(
    `Seeded ${bundle.usmle.length} USMLE rows, ${bundle.aamcCompetencies.length} AAMC competencies, ${bundle.aamcKeywords.length} keywords`,
  );
}

async function main() {
  const skipEmbeddings = process.argv.includes("--skip-embeddings");
  await seedFrameworks({ skipEmbeddings });
}

const isCli = process.argv[1]?.includes("seed-frameworks");
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
