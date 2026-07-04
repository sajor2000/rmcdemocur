/**
 * U5 relevance-threshold calibration.
 *
 * The retrieval floors (`RETRIEVAL_MAX_DISTANCE`, `SEARCH_MIN_SIMILARITY`) ship
 * default-off because the real cosine-distance distribution only exists after a
 * live re-embed (see docs/plans/2026-07-03-007, unit U5). This script dumps
 * those distributions from the current database and prints ready-to-paste env
 * values calibrated from real data rather than a guess.
 *
 * What it measures, per retrieval path:
 *   - Accepted:  distance(chunk, framework-row) for pairs the LLM actually
 *                aligned (or keyword tags it attached). A floor below this band
 *                silently drops real alignments — the fail-closed failure mode
 *                the plan warns about.
 *   - Pool:      distance of every top-K candidate the retrieval query returns.
 *                Its long tail is the junk the floor is meant to cut.
 * The gap between the accepted band and the pool tail is where a safe floor sits.
 *
 * For search, there is no query log, so it uses course objectives as on-topic
 * proxy queries and a fixed off-topic set, then reports the similarity bands.
 *
 * Usage:
 *   npx tsx scripts/calibrate-thresholds.ts              # full report
 *   npx tsx scripts/calibrate-thresholds.ts --no-search  # skip Azure calls
 */
import "./load-env";
import { sql } from "drizzle-orm";
import { getDb } from "../lib/db";
import { generateEmbedding } from "../lib/azure-ai";

const RUN_SEARCH = !process.argv.includes("--no-search");

// pgvector `<=>` is cosine distance; similarity = 1 - distance.
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0],
    p5: percentile(sorted, 5),
    p10: percentile(sorted, 10),
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
  };
}

const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : "  -  ");

function printDist(label: string, values: number[]) {
  const s = stats(values);
  console.log(
    `  ${label.padEnd(16)} n=${String(s.n).padStart(5)}  ` +
      `min=${f3(s.min)} p5=${f3(s.p5)} p50=${f3(s.p50)} ` +
      `p90=${f3(s.p90)} p95=${f3(s.p95)} p99=${f3(s.p99)} max=${f3(s.max)}`,
  );
}

async function nums(query: any): Promise<number[]> {
  const db = getDb();
  const rows = (await db.execute(query)).rows as Record<string, unknown>[];
  return rows
    .map((r) => Number(r.distance ?? r.similarity))
    .filter((x) => Number.isFinite(x));
}

interface PathResult {
  name: string;
  accepted: number[];
  pool: number[];
  k: number;
}

async function frameworkPath(
  name: string,
  poolQuery: any,
  acceptedQuery: any,
  k: number,
): Promise<PathResult> {
  const [pool, accepted] = await Promise.all([nums(poolQuery), nums(acceptedQuery)]);
  return { name, accepted, pool, k };
}

async function main() {
  console.log("=== U5 threshold calibration (real embeddings) ===\n");

  // ---- Framework + keyword retrieval paths (RETRIEVAL_MAX_DISTANCE) ----
  const aamc = await frameworkPath(
    "AAMC",
    sql`
      SELECT d.distance FROM chunks c
      CROSS JOIN LATERAL (
        SELECT (f.embedding <=> c.embedding) AS distance
        FROM aamc_competencies f WHERE f.embedding IS NOT NULL
        ORDER BY f.embedding <=> c.embedding LIMIT 20
      ) d WHERE c.embedding IS NOT NULL`,
    sql`
      SELECT (f.embedding <=> c.embedding) AS distance
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN aamc_competencies f ON f.stable_id = a.framework_id
      WHERE a.framework IN ('AAMC_PCRS','AAMC_EPA')
        AND f.embedding IS NOT NULL AND c.embedding IS NOT NULL`,
    20,
  );

  const usmle = await frameworkPath(
    "USMLE",
    sql`
      SELECT d.distance FROM chunks c
      CROSS JOIN LATERAL (
        SELECT (f.embedding <=> c.embedding) AS distance
        FROM usmle_domains f
        WHERE f.embedding IS NOT NULL AND f.subdomain IS NOT NULL
        ORDER BY f.embedding <=> c.embedding LIMIT 20
      ) d WHERE c.embedding IS NOT NULL`,
    sql`
      SELECT (f.embedding <=> c.embedding) AS distance
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      JOIN usmle_domains f ON f.stable_id = a.framework_id
      WHERE a.framework = 'USMLE'
        AND f.embedding IS NOT NULL AND c.embedding IS NOT NULL`,
    20,
  );

  const keyword = await frameworkPath(
    "keyword",
    sql`
      SELECT d.distance FROM chunks c
      CROSS JOIN LATERAL (
        SELECT (f.embedding <=> c.embedding) AS distance
        FROM aamc_keywords f WHERE f.embedding IS NOT NULL
        ORDER BY f.embedding <=> c.embedding LIMIT 5
      ) d WHERE c.embedding IS NOT NULL`,
    sql`
      SELECT (k.embedding <=> c.embedding) AS distance
      FROM keyword_tags t
      JOIN chunks c ON c.id = t.chunk_id
      JOIN aamc_keywords k ON k.stable_id = t.category
      WHERE k.embedding IS NOT NULL AND c.embedding IS NOT NULL`,
    5,
  );

  const paths = [aamc, usmle, keyword];

  console.log("Cosine-distance distributions (lower = closer):\n");
  for (const p of paths) {
    console.log(`[${p.name}] top-${p.k} candidate pool vs LLM-accepted`);
    printDist("pool (top-K)", p.pool);
    printDist("accepted", p.accepted);
    console.log("");
  }

  // A zero-loss global floor keeps every accepted pair; it still trims the pool
  // tail beyond that point. Report it plus the pool coverage it retains.
  const acceptedMax = Math.max(...paths.map((p) => stats(p.accepted).max));
  const acceptedP99 = Math.max(...paths.map((p) => stats(p.accepted).p99));
  const safeFloor = Math.ceil(acceptedMax * 100) / 100;
  const tightFloor = Math.ceil(acceptedP99 * 100) / 100;

  const poolRetained = (floor: number) => {
    const all = paths.flatMap((p) => p.pool);
    return (100 * all.filter((d) => d <= floor).length) / all.length;
  };
  const acceptedKept = (floor: number) => {
    const all = paths.flatMap((p) => p.accepted);
    return (100 * all.filter((d) => d <= floor).length) / all.length;
  };

  console.log("RETRIEVAL_MAX_DISTANCE (one global floor across all three paths):");
  console.log(
    `  safe   = ${safeFloor.toFixed(2)}  → keeps ${acceptedKept(safeFloor).toFixed(1)}% of accepted, ` +
      `trims pool to ${poolRetained(safeFloor).toFixed(0)}% (zero-alignment-loss)`,
  );
  console.log(
    `  tight  = ${tightFloor.toFixed(2)}  → keeps ${acceptedKept(tightFloor).toFixed(1)}% of accepted, ` +
      `trims pool to ${poolRetained(tightFloor).toFixed(0)}% (drops the accepted tail)`,
  );
  console.log("");

  // ---- Search path (SEARCH_MIN_SIMILARITY) ----
  if (!RUN_SEARCH) {
    console.log("Search path skipped (--no-search).");
    process.exit(0);
  }

  const db = getDb();
  const courseRow = (
    await db.execute(sql`
      SELECT DISTINCT d.course_id FROM chunks c
      JOIN documents d ON d.id = c.document_id LIMIT 1`)
  ).rows[0] as { course_id: number };
  const courseId = courseRow.course_id;

  const objRows = (
    await db.execute(sql`SELECT text FROM course_objectives ORDER BY id`)
  ).rows as { text: string }[];
  const onTopic = objRows.map((r) => r.text);

  const offTopic = [
    "How do I refinance a 30-year fixed mortgage?",
    "Best hiking trails near Seattle in autumn",
    "What is the capital of Australia?",
    "Recipe for sourdough bread starter",
    "How does a car transmission work?",
    "Rules of cricket for beginners",
    "Photosynthesis in C4 plants",
    "History of the Roman Empire",
    "How to train a puppy to sit",
    "Quantum entanglement explained simply",
    "Stock market index fund strategy",
    "How to change a bicycle tire",
  ];

  async function topKSimilarities(queries: string[]): Promise<{ top1: number[]; top5: number[] }> {
    const top1: number[] = [];
    const top5: number[] = [];
    for (const q of queries) {
      const emb = await generateEmbedding(q);
      const vec = `[${emb.join(",")}]`;
      const rows = (
        await db.execute(sql`
          SELECT 1 - (c.embedding <=> ${vec}::vector) AS similarity
          FROM chunks c
          JOIN documents d ON d.id = c.document_id
          WHERE d.course_id = ${courseId} AND c.embedding IS NOT NULL
          ORDER BY c.embedding <=> ${vec}::vector
          LIMIT 5`)
      ).rows as { similarity: number }[];
      const sims = rows.map((r) => Number(r.similarity));
      if (sims.length) {
        top1.push(sims[0]);
        top5.push(...sims);
      }
    }
    return { top1, top5 };
  }

  console.log(`Search proxy: ${onTopic.length} on-topic objectives, ${offTopic.length} off-topic queries\n`);
  const on = await topKSimilarities(onTopic);
  const off = await topKSimilarities(offTopic);

  console.log("Cosine-similarity distributions (higher = more relevant):");
  printDist("on top-1", on.top1);
  printDist("on top-5", on.top5);
  printDist("off top-1", off.top1);
  printDist("off top-5", off.top5);
  console.log("");

  // A floor between the off-topic top and the on-topic body separates a real
  // hit from a forced one. Anchor above off-topic p95, below on-topic p10.
  const offCeil = percentile([...off.top1].sort((a, b) => a - b), 95);
  const onFloor = percentile([...on.top1].sort((a, b) => a - b), 10);
  const recommend = Math.floor(((offCeil + onFloor) / 2) * 100) / 100;
  const onKept = (100 * on.top1.filter((s) => s >= recommend).length) / on.top1.length;
  const offKept = (100 * off.top1.filter((s) => s >= recommend).length) / off.top1.length;

  console.log("SEARCH_MIN_SIMILARITY:");
  console.log(
    `  off-topic p95=${f3(offCeil)}  on-topic p10=${f3(onFloor)}  → recommend ${recommend.toFixed(2)}`,
  );
  console.log(
    `  at ${recommend.toFixed(2)}: keeps ${onKept.toFixed(0)}% of on-topic best hits, ` +
      `passes ${offKept.toFixed(0)}% of off-topic best hits`,
  );
  console.log("");

  console.log("=== Paste into .env.local ===");
  console.log(`RETRIEVAL_MAX_DISTANCE=${safeFloor.toFixed(2)}`);
  console.log(`SEARCH_MIN_SIMILARITY=${recommend.toFixed(2)}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
