import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { get as blobGet } from "@vercel/blob";
import { mediaAssets } from "@/drizzle/schema";
import { getDb } from "@/lib/db";
import { blobConfigured, resolveMediaKeyPath } from "@/lib/media-storage";

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
  request: Request,
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

  if (!asset) {
    return NextResponse.json({ error: "Media asset not found" }, { status: 404 });
  }
  if (!asset.storagePath) {
    return NextResponse.json({ error: "Asset has no associated file" }, { status: 404 });
  }

  if (blobConfigured()) {
    return serveFromBlob(asset.storagePath, request);
  }
  return serveFromDisk(asset.storagePath);
}

async function serveFromBlob(key: string, request: Request): Promise<NextResponse> {
  let result: Awaited<ReturnType<typeof blobGet>>;
  try {
    result = await blobGet(key, { access: "private" });
  } catch {
    result = null;
  }

  if (!result) {
    // Distinguishable from "asset unknown" (R6) — the DB row and its key
    // exist, but no object was ever uploaded under it. A forgotten
    // `db:extract-media` upload step surfaces here, diagnosably, not as a
    // generic 404 indistinguishable from a bad asset id.
    return NextResponse.json(
      { error: "Media bytes not found in Blob storage — extraction may not have been uploaded" },
      { status: 404 },
    );
  }

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === result.blob.etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag } });
  }

  if (result.statusCode === 304 || !result.stream) {
    return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag } });
  }

  const bytes = await new Response(result.stream).arrayBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "Cache-Control": "private, no-cache",
      ETag: result.blob.etag,
    },
  });
}

async function serveFromDisk(key: string): Promise<NextResponse> {
  const safePath = resolveMediaKeyPath(key);
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
