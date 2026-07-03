import fs from "fs/promises";
import path from "path";

export const MEDIA_ROOT = path.join(process.cwd(), "data/curriculum/media");

export function documentBasename(filename: string): string {
  return path.basename(filename, path.extname(filename));
}

export function mediaDirForDocument(caseNumber: number, filename: string): string {
  return path.join(MEDIA_ROOT, String(caseNumber), documentBasename(filename));
}

export function mediaFilePath(
  caseNumber: number,
  filename: string,
  sourceIndex: number,
  ext: string,
): string {
  const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
  return path.join(
    mediaDirForDocument(caseNumber, filename),
    `${sourceIndex}${normalizedExt}`,
  );
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
      return {
        sourceIndex: Number(match[1]),
        storagePath: path.join(dir, name),
        ext: match[2],
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
}

/** Reject paths outside the curriculum media root (local file read guard). */
export function resolveSafeMediaPath(storagePath: string): string | null {
  const resolved = path.resolve(storagePath);
  const root = path.resolve(MEDIA_ROOT);
  if (resolved === root) return null;
  if (!resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}
