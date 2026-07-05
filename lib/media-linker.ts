import type { FigureRegistryEntry } from "@/lib/media-types";
import { labelMentionedInText } from "@/lib/figure-registry";

export type ChunkForLinking = {
  id: number;
  content: string;
  section: string | null;
};

export type MediaAssetForLinking = {
  id: number;
  label: string;
  textForEmbed: string | null;
  referenceKind: string;
};

export function enrichEmbedText(
  chunkContent: string,
  embedText: string,
  linkedMedia: Pick<MediaAssetForLinking, "textForEmbed" | "label">[],
): string {
  const additions: string[] = [];
  for (const media of linkedMedia) {
    if (!media.textForEmbed) continue;
    const caption = media.textForEmbed.trim();
    if (!caption) continue;
    if (chunkContent.includes(caption) || embedText.includes(caption)) continue;
    additions.push(`${media.label}: ${caption}`);
  }
  if (!additions.length) return embedText;
  return `${additions.join("\n")}\n\n${embedText}`;
}

export function linkChunksToMedia(
  chunks: ChunkForLinking[],
  mediaAssets: MediaAssetForLinking[],
): { chunkId: number; mediaAssetId: number }[] {
  const links: { chunkId: number; mediaAssetId: number }[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    for (const media of mediaAssets) {
      if (!labelMentionedInText(media.label, chunk.content)) continue;
      const key = `${chunk.id}:${media.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ chunkId: chunk.id, mediaAssetId: media.id });
    }
  }

  return links;
}
