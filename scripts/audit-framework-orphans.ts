import "./load-env";
import path from "path";
import { sql } from "drizzle-orm";
import { getDb } from "../lib/db";
import { partitionOrphans, summarizeOrphans, type AlignmentRef } from "../lib/framework-orphans";

/**
 * Read-only audit (U4): report USMLE alignments whose framework_id no longer
 * matches any usmle_domains.stable_id — the orphan state a taxonomy re-seed can
 * create (loose string join, no FK). The R4 gate after a migration:
 *   - zero orphans on UNREVIEWED chunks (a review-preserving realign rewrites
 *     them), and
 *   - every REVIEWED-chunk orphan re-aligned + re-approved (realign skips
 *     reviewed chunks, so surfacing is not fixing — each needs remediation).
 * Side-effect-free. Usage: npx tsx scripts/audit-framework-orphans.ts [courseId]
 */
async function main() {
  const db = getDb();
  const courseArg = process.argv[2];
  const courseId = courseArg ? Number(courseArg) : null;

  const refsRes = await db.execute(sql`
    SELECT a.framework_id AS framework_id, a.status AS status, a.chunk_id AS chunk_id
    FROM alignments a
    JOIN chunks c ON c.id = a.chunk_id
    JOIN documents d ON d.id = c.document_id
    WHERE a.framework = 'USMLE'
      ${courseId ? sql`AND d.course_id = ${courseId}` : sql``}
  `);
  const validRes = await db.execute(sql`SELECT stable_id FROM usmle_domains`);

  const alignments: AlignmentRef[] = (refsRes.rows as {
    framework_id: string | null; status: string | null; chunk_id: number;
  }[]).map((r) => ({ frameworkId: r.framework_id ?? "", status: r.status, chunkId: r.chunk_id }));
  const validStableIds = new Set(
    (validRes.rows as { stable_id: string }[]).map((r) => r.stable_id),
  );

  const { unreviewed, reviewed } = partitionOrphans(alignments, validStableIds);

  console.log(
    `Framework-orphan audit${courseId ? ` (course ${courseId})` : ""}: ${alignments.length} USMLE alignments vs ${validStableIds.size} taxonomy nodes.`,
  );
  console.log(`Unreviewed orphans: ${unreviewed.length} (expected 0 after a review-preserving realign).`);
  for (const o of summarizeOrphans(unreviewed).slice(0, 20)) {
    console.log(`  • ${o.count}× ${o.frameworkId}`);
  }
  console.log(`\nReviewed-chunk orphans: ${reviewed.length} (each needs re-align + faculty re-approval — surfacing is not fixing).`);
  for (const o of reviewed) {
    console.log(`  • chunk ${o.chunkId} [${o.status}] → ${o.frameworkId}`);
  }

  const clean = unreviewed.length === 0 && reviewed.length === 0;
  console.log(`\n${clean ? "PASS — no orphans." : "ACTION NEEDED — orphans present (see above)."}`);
}

const isCli = path.basename(process.argv[1] ?? "") === "audit-framework-orphans.ts";
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { main as auditFrameworkOrphans };
