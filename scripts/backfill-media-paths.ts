/**
 * One-time backfill converting media_assets.storage_path from an absolute
 * dev-machine filesystem path to the relative locator key
 * {caseNumber}/{docBasename}/{sourceIndex}.{ext} (R1, R4). Idempotent — a
 * row whose storage_path is already relative is left untouched, so this is
 * safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-media-paths.ts
 */
import "./load-env";
import path from "path";
import { eq, isNotNull } from "drizzle-orm";
import { mediaAssets } from "@/drizzle/schema";
import { getDb } from "@/lib/db";

const TAIL_PATTERN = /(\d+)\/([^/\\]+)\/(\d+)\.([a-zA-Z0-9]+)$/;

// path.win32.isAbsolute (not path.isAbsolute, which is POSIX-only on this
// platform) also treats a leading '/' as absolute alongside drive letters and
// UNC paths — exactly the shape a storage_path written on any prior machine
// could take.
export function isAbsoluteLikePath(value: string): boolean {
  return path.win32.isAbsolute(value);
}

/** Extract the {caseNumber}/{basename}/{sourceIndex}.{ext} tail from an
 * absolute path, regardless of the machine-specific prefix it was written
 * under. Returns null if the path doesn't end in that shape. */
export function toLocatorKey(storagePath: string): string | null {
  const match = TAIL_PATTERN.exec(storagePath.replace(/\\/g, "/"));
  if (!match) return null;
  const [, caseNumber, basename, sourceIndex, ext] = match;
  return `${caseNumber}/${basename}/${sourceIndex}.${ext}`;
}

export type BackfillSummary = {
  converted: number;
  alreadyRelative: number;
  unrecognized: { id: number; storagePath: string }[];
};

export async function backfillMediaPaths(): Promise<BackfillSummary> {
  const db = getDb();
  const rows = await db
    .select({ id: mediaAssets.id, storagePath: mediaAssets.storagePath })
    .from(mediaAssets)
    .where(isNotNull(mediaAssets.storagePath));

  const summary: BackfillSummary = { converted: 0, alreadyRelative: 0, unrecognized: [] };

  for (const row of rows) {
    const storagePath = row.storagePath as string;
    if (!isAbsoluteLikePath(storagePath)) {
      summary.alreadyRelative += 1;
      continue;
    }
    const key = toLocatorKey(storagePath);
    if (!key) {
      summary.unrecognized.push({ id: row.id, storagePath });
      continue;
    }
    await db.update(mediaAssets).set({ storagePath: key }).where(eq(mediaAssets.id, row.id));
    summary.converted += 1;
  }

  return summary;
}

async function main() {
  const summary = await backfillMediaPaths();
  console.log(JSON.stringify(summary, null, 2));
  if (summary.unrecognized.length > 0) {
    console.warn(
      `${summary.unrecognized.length} row(s) had an unrecognized storage_path shape and were left unchanged — investigate before deploying.`,
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
