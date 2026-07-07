import "./load-env";
import path from "path";
import { sql } from "drizzle-orm";
import { getDb } from "../lib/db";
import { courseTargetSystems } from "../lib/course-scope";
import { getCourseWithDocuments } from "../lib/queries";
import { rankGapCandidates } from "../lib/gap-audit";

/**
 * Read-only triage for coverage gaps that are likely DETECTION MISSES rather
 * than true gaps (U3 / R3). For every in-scope USMLE leaf node with zero
 * (non-rejected) alignments in this course, it checks whether the node's
 * distinctive keywords appear in any of the course's chunks and prints a ranked
 * list of candidates for human/LLM confirmation.
 *
 * This is a TRIAGE tool, not a verdict (KTD2): lexical presence is a weak proxy,
 * so a flagged node still needs confirmation and a review-preserving realign
 * (scripts/realign.ts) to actually close the miss. Side-effect-free.
 *
 * Usage: npx tsx scripts/audit-gap-detection.ts [courseId]  (default 1)
 */
async function main() {
  const db = getDb();
  const courseId = Number(process.argv[2] ?? 1);
  const { course } = await getCourseWithDocuments(courseId);
  if (!course) {
    console.error(`No course ${courseId}`);
    process.exit(1);
  }

  const targetSystems = courseTargetSystems(course.code);
  const sysList = targetSystems
    ? sql.join(targetSystems.map((s) => sql`${s}`), sql`, `)
    : null;

  // In-scope USMLE leaf nodes with zero non-rejected alignments for this course.
  const gapRows = await db.execute(sql`
    SELECT ud.stable_id, ud.domain, ud.subdomain, ud.full_text
    FROM usmle_domains ud
    WHERE ud.parent_stable_id IS NOT NULL
      ${sysList ? sql`AND ud.domain IN (${sysList})` : sql``}
      AND NOT EXISTS (
        SELECT 1 FROM alignments a
        JOIN chunks c ON c.id = a.chunk_id
        JOIN documents d ON d.id = c.document_id
        WHERE a.framework_id = ud.stable_id
          AND d.course_id = ${courseId}
          AND a.status IS DISTINCT FROM 'rejected'
      )
  `);

  const chunkRows = await db.execute(sql`
    SELECT c.id, c.document_id, c.content
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE d.course_id = ${courseId}
  `);

  const gapNodes = (gapRows.rows as {
    stable_id: string; domain: string; subdomain: string | null; full_text: string | null;
  }[]).map((r) => ({
    stableId: r.stable_id,
    system: r.domain,
    topic: r.subdomain ? `${r.domain} — ${r.subdomain}` : r.domain,
    subdomain: r.subdomain,
    fullText: r.full_text,
  }));

  const chunks = (chunkRows.rows as { id: number; document_id: number | null; content: string }[]).map((c) => ({
    id: c.id,
    documentId: c.document_id,
    content: c.content,
  }));

  const candidates = rankGapCandidates(gapNodes, chunks);

  console.log(
    `Gap-detection triage for course ${course.code} (${courseId}): ${gapNodes.length} in-scope gap node(s), ${chunks.length} chunk(s).`,
  );
  console.log(
    `${candidates.length} node(s) flagged as LIKELY false negatives (keywords present in course content). Triage only — confirm before re-aligning.\n`,
  );
  for (const c of candidates) {
    console.log(`• [${c.hits.length} hit(s): ${c.hits.join(", ")}] ${c.topic}`);
    console.log(`    ${c.stableId}`);
    console.log(`    doc ${c.documentId}, chunk ${c.chunkId}: "${c.excerpt}"\n`);
  }
  if (candidates.length === 0) {
    console.log("No lexical false-negative candidates — the in-scope gaps look genuine (or purely semantic).");
  }
}

const isCli = path.basename(process.argv[1] ?? "") === "audit-gap-detection.ts";
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { main as auditGapDetection };
