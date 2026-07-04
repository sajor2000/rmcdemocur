import fs from "fs/promises";
import path from "path";

export const MEDIA_ROOT = process.env.MEDIA_ROOT
  ? path.resolve(process.env.MEDIA_ROOT)
  : path.join(process.cwd(), "data/curriculum/media");

export function documentBasename(filename: string): string {
  return path.basename(filename, path.extname(filename));
}

export function mediaDirForDocument(caseNumber: number, filename: string): string {
  return path.join(MEDIA_ROOT, String(caseNumber), documentBasename(filename));
}

/** Relative locator key persisted to media_assets.storage_path — portable
 * across machines and deploys; the DB never stores an absolute path. */
export function mediaLocatorKey(
  caseNumber: number,
  filename: string,
  sourceIndex: number,
  ext: string,
): string {
  const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
  return path.posix.join(
    String(caseNumber),
    documentBasename(filename),
    `${sourceIndex}${normalizedExt}`,
  );
}

/** Reject a locator key that would resolve outside MEDIA_ROOT (traversal guard). */
export function resolveMediaKeyPath(key: string): string | null {
  const root = path.resolve(MEDIA_ROOT);
  const resolved = path.resolve(root, key);
  if (resolved === root) return null;
  if (!resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

export function mediaFilePath(
  caseNumber: number,
  filename: string,
  sourceIndex: number,
  ext: string,
): string {
  const key = mediaLocatorKey(caseNumber, filename, sourceIndex, ext);
  const resolved = resolveMediaKeyPath(key);
  if (!resolved) {
    // Unreachable in practice: a key built from documentBasename(filename)
    // cannot escape MEDIA_ROOT unless filename itself smuggles a traversal.
    throw new Error(`mediaFilePath: locator key resolved outside MEDIA_ROOT: ${key}`);
  }
  return resolved;
}

export async function listExtractedMediaFiles(
  caseNumber: number,
  filename: string,
): Promise<{ sourceIndex: number; storagePath: string; ext: string }[]> {
  const dir = mediaDirForDocument(caseNumber, filename);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  return entries
    .map((name) => {
      const match = /^(\d+)\.([a-z0-9]+)$/i.exec(name);
      if (!match) return null;
      const sourceIndex = Number(match[1]);
      const ext = match[2];
      return {
        sourceIndex,
        // Relative key (R1) — never the absolute fs path.
        storagePath: mediaLocatorKey(caseNumber, filename, sourceIndex, ext),
        ext,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
}
