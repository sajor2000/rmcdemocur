/**
 * One-time collapse of duplicate media_assets rows written by the pre-upsert
 * pipeline (a resumed run re-inserted rows instead of updating them). Must run
 * before scripts/db-init.ts can create the media_assets_key_idx unique index.
 *
 * Survivor per duplicate group: prefer the row with storage_path set, then the
 * row with text_for_embed set, tiebreak lowest id. Losers' chunk_media links
 * are repointed to the survivor (never dropped) before the loser rows are
 * deleted, and any caption/storage field present only on a loser is coalesced
 * onto the survivor so no data is lost.
 *
 * All four steps run as a single non-interactive Postgres transaction via
 * neon's `sql.transaction()` batch mode. This needed no interactive
 * (read-then-decide) transaction and so no separate WebSocket/Pool connection:
 * survivor selection is expressed as SQL window functions the CTE recomputes
 * in every statement, so each statement is independently correct and the
 * four-statement batch commits atomically in one round trip.
 *
 * Usage:
 *   npx tsx scripts/collapse-duplicate-media.ts
 */
import "./load-env";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { directUrl } from "./db-init";

const RANKED_CTE = `
  ranked AS (
    SELECT id, storage_path, text_for_embed, has_caption_in_text, caption_source,
           ROW_NUMBER() OVER (
             PARTITION BY document_id, label, reference_kind, COALESCE(source_index, -1)
             ORDER BY (storage_path IS NOT NULL) DESC, (text_for_embed IS NOT NULL) DESC, id ASC
           ) AS rn,
           FIRST_VALUE(id) OVER (
             PARTITION BY document_id, label, reference_kind, COALESCE(source_index, -1)
             ORDER BY (storage_path IS NOT NULL) DESC, (text_for_embed IS NOT NULL) DESC, id ASC
           ) AS survivor_id
    FROM media_assets
  )
`;

// ReturnType<typeof neon> resolves to the widened NeonQueryFunction<boolean,
// boolean> overload rather than the <false, false> shape neon(url) (no
// options) actually returns, which then rejects that concrete value as an
// argument wherever it's passed back in (a TS overload-inference quirk, not a
// real type mismatch) — so this pins the concrete shape explicitly.
type NeonSql = NeonQueryFunction<false, false>;

export async function countDuplicateMediaGroups(sql: NeonSql): Promise<number> {
  const rows = (await sql(`
    SELECT COUNT(*)::int AS n FROM (
      SELECT document_id, label, reference_kind, COALESCE(source_index, -1) AS key_index
      FROM media_assets
      GROUP BY document_id, label, reference_kind, COALESCE(source_index, -1)
      HAVING COUNT(*) > 1
    ) dup
  `)) as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

export async function collapseDuplicateMediaAssets(
  sql: NeonSql,
): Promise<{ groupsCollapsed: number }> {
  const before = await countDuplicateMediaGroups(sql);
  if (before === 0) {
    return { groupsCollapsed: 0 };
  }

  await sql.transaction([
    sql(`
      WITH ${RANKED_CTE}
      INSERT INTO chunk_media (chunk_id, media_asset_id)
      SELECT cm.chunk_id, r.survivor_id
      FROM chunk_media cm
      JOIN ranked r ON r.id = cm.media_asset_id AND r.rn > 1
      ON CONFLICT (chunk_id, media_asset_id) DO NOTHING
    `),
    sql(`
      WITH ${RANKED_CTE}
      DELETE FROM chunk_media
      WHERE media_asset_id IN (SELECT id FROM ranked WHERE rn > 1)
    `),
    sql(`
      WITH ${RANKED_CTE},
      losers AS (SELECT * FROM ranked WHERE rn > 1),
      coalesced AS (
        SELECT survivor_id,
               (array_agg(storage_path) FILTER (WHERE storage_path IS NOT NULL))[1] AS loser_storage_path,
               (array_agg(text_for_embed) FILTER (WHERE text_for_embed IS NOT NULL))[1] AS loser_text_for_embed,
               (array_agg(caption_source) FILTER (WHERE caption_source IS NOT NULL))[1] AS loser_caption_source,
               bool_or(has_caption_in_text) AS loser_has_caption
        FROM losers
        GROUP BY survivor_id
      )
      UPDATE media_assets ma
      SET storage_path = COALESCE(ma.storage_path, c.loser_storage_path),
          text_for_embed = COALESCE(ma.text_for_embed, c.loser_text_for_embed),
          caption_source = COALESCE(ma.caption_source, c.loser_caption_source),
          has_caption_in_text = ma.has_caption_in_text OR c.loser_has_caption
      FROM coalesced c
      WHERE ma.id = c.survivor_id
    `),
    sql(`
      WITH ${RANKED_CTE}
      DELETE FROM media_assets WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `),
  ]);

  const after = await countDuplicateMediaGroups(sql);
  if (after > 0) {
    throw new Error(
      `Collapse ran but ${after} duplicate group(s) remain — investigate before creating the unique index.`,
    );
  }

  return { groupsCollapsed: before };
}

async function main() {
  const sql = neon(directUrl());
  const result = await collapseDuplicateMediaAssets(sql);
  if (result.groupsCollapsed === 0) {
    console.log("No duplicate media_assets rows found — nothing to collapse.");
  } else {
    console.log(`Collapsed ${result.groupsCollapsed} duplicate group(s).`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
