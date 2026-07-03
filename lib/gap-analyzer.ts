import { sql, eq } from "drizzle-orm";
import { documents, gapSummary } from "@/drizzle/schema";
import { getDb } from "@/lib/db";

export type CoverageStatus = "covered" | "partial" | "gap";

export function deriveCoverageStatus(
  chunkCount: number,
  avgConfidence: number,
): CoverageStatus {
  if (chunkCount === 0) return "gap";
  if (avgConfidence >= 0.8 && chunkCount >= 1) return "covered";
  if (avgConfidence >= 0.5 || chunkCount >= 1) return "partial";
  return "gap";
}

export function suggestedGapAction(
  frameworkLabel: string,
  status: CoverageStatus,
): string {
  if (status === "gap") {
    return `Consider adding a case or lecture addressing ${frameworkLabel} to close this coverage gap.`;
  }
  return `Review existing ${frameworkLabel} content and strengthen activities with partial alignment.`;
}

/**
 * Persist uncovered USMLE/AAMC taxonomy leaves as gap rows for a course.
 * Uses the first course document as anchor for gap_summary.document_id.
 */
export async function recomputeCourseFrameworkGaps(courseId: number) {
  const db = getDb();
  const docs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.courseId, courseId))
    .orderBy(documents.caseNumber);

  if (!docs.length) return;

  const anchorDocId = docs[0].id;

  await db.execute(sql`
    DELETE FROM gap_summary gs
    USING documents d
    WHERE gs.document_id = d.id
      AND d.course_id = ${courseId}
      AND gs.chunk_count = 0
      AND gs.coverage_status = 'gap'
      AND (gs.framework_id LIKE 'usmle:%' OR gs.framework_id LIKE 'aamc:%')
  `);

  const uncoveredUsmle = await db.execute(sql`
    SELECT ud.stable_id, ud.domain, ud.subdomain
    FROM usmle_domains ud
    WHERE ud.parent_stable_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM alignments a
        JOIN chunks c ON c.id = a.chunk_id
        JOIN documents d ON d.id = c.document_id
        WHERE d.course_id = ${courseId}
          AND a.framework = 'USMLE'
          AND a.framework_id = ud.stable_id
      )
    LIMIT 200
  `);

  for (const row of uncoveredUsmle.rows as Record<string, unknown>[]) {
    await db.insert(gapSummary).values({
      documentId: anchorDocId,
      framework: "USMLE",
      frameworkId: String(row.stable_id),
      frameworkLabel: `${row.domain}${row.subdomain ? ` — ${row.subdomain}` : ""}`,
      coverageStatus: "gap",
      chunkCount: 0,
      avgConfidence: "0.00",
    });
  }

  const uncoveredAamc = await db.execute(sql`
    SELECT ac.stable_id, ac.sub_id, ac.domain_name, ac.description
    FROM aamc_competencies ac
    WHERE ac.stable_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM alignments a
        JOIN chunks c ON c.id = a.chunk_id
        JOIN documents d ON d.id = c.document_id
        WHERE d.course_id = ${courseId}
          AND a.framework IN ('AAMC_PCRS', 'AAMC_EPA')
          AND (a.framework_id = ac.stable_id OR a.framework_id = ac.sub_id)
      )
    LIMIT 100
  `);

  for (const row of uncoveredAamc.rows as Record<string, unknown>[]) {
    const stableId = String(row.stable_id ?? row.sub_id);
    const isEpa = stableId.includes("epa");
    await db.insert(gapSummary).values({
      documentId: anchorDocId,
      framework: isEpa ? "AAMC_EPA" : "AAMC_PCRS",
      frameworkId: stableId,
      frameworkLabel: `${row.sub_id}: ${row.domain_name} — ${row.description}`,
      coverageStatus: "gap",
      chunkCount: 0,
      avgConfidence: "0.00",
    });
  }
}
