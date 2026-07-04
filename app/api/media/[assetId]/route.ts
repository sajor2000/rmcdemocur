import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { mediaAssets } from "@/drizzle/schema";
import { getDb } from "@/lib/db";
import { resolveMediaKeyPath } from "@/lib/media-storage";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  emf: "image/emf",
  wmf: "image/wmf",
};

export async function GET(
  _request: Request,
  { params }: { params: { assetId: string } },
) {
  const assetId = Number(params.assetId);
  if (!Number.isFinite(assetId)) {
    return NextResponse.json({ error: "Invalid asset id" }, { status: 400 });
  }

  const db = getDb();
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);

  if (!asset?.storagePath) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  const safePath = resolveMediaKeyPath(asset.storagePath);
  if (!safePath) {
    return NextResponse.json({ error: "Media path not allowed" }, { status: 403 });
  }

  try {
    const data = await fs.readFile(safePath);
    const ext = path.extname(safePath).slice(1).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media file missing on disk" }, { status: 404 });
  }
}
