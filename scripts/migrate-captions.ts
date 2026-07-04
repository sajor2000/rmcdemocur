/**
 * One-time migration for DBs that ran the old CSV importer, which patched
 * media_assets.textForEmbed directly (no figure_captions table existed yet).
 *
 * Run `npm run db:import-figure-captions -- <csv-path>` FIRST — the archived
 * CSV file is the authoritative source, and re-importing it covers every
 * caption the CSV still has. This script only rescues the residual case: a
 * media_assets row that's captioned but has no matching figure_captions row
 * even after that re-import (the CSV that produced it may be lost or
 * incomplete). Rescued rows are copied into figure_captions AND reported,
 * since we can't verify them against the original CSV.
 *
 * Usage:
 *   npx tsx scripts/migrate-captions.ts
 */
import "./load-env";
import { eq, and, isNotNull } from "drizzle-orm";
import { documents, figureCaptions, mediaAssets } from "@/drizzle/schema";
import { getDb } from "@/lib/db";

export type CaptionMigrationSummary = {
  rescued: number;
  alreadyCovered: number;
  reported: { mediaAssetId: number; filename: string; label: string }[];
};

function coveredKey(filename: string, label: string): string {
  return `${filename}::${label}`;
}

export async function migrateCaptionsToInputTable(): Promise<CaptionMigrationSummary> {
  const db = getDb();
  const captionedAssets = await db
    .select({
      id: mediaAssets.id,
      filename: documents.filename,
      label: mediaAssets.label,
      sourceIndex: mediaAssets.sourceIndex,
      textForEmbed: mediaAssets.textForEmbed,
    })
    .from(mediaAssets)
    .innerJoin(documents, eq(documents.id, mediaAssets.documentId))
    .where(and(eq(mediaAssets.hasCaptionInText, true), isNotNull(mediaAssets.textForEmbed)));

  const existingCaptions = await db
    .select({ filename: figureCaptions.filename, label: figureCaptions.label })
    .from(figureCaptions);
  const covered = new Set(existingCaptions.map((row) => coveredKey(row.filename, row.label)));

  const summary: CaptionMigrationSummary = { rescued: 0, alreadyCovered: 0, reported: [] };

  for (const asset of captionedAssets) {
    if (covered.has(coveredKey(asset.filename, asset.label))) {
      summary.alreadyCovered += 1;
      continue;
    }

    await db
      .insert(figureCaptions)
      .values({
        filename: asset.filename,
        label: asset.label,
        textForEmbed: asset.textForEmbed as string,
        sourceIndex: asset.sourceIndex,
      })
      .onConflictDoNothing();
    summary.rescued += 1;
    summary.reported.push({ mediaAssetId: asset.id, filename: asset.filename, label: asset.label });
  }

  return summary;
}

async function main() {
  const summary = await migrateCaptionsToInputTable();
  console.log(JSON.stringify(summary, null, 2));
  if (summary.reported.length > 0) {
    console.warn(
      `${summary.reported.length} caption(s) had no matching figure_captions row and were ` +
        `rescued from media_assets directly — verify these against source material.`,
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
