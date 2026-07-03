import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { chunks } from "@/drizzle/schema";
import { getDb } from "@/lib/db";
import { alignToFramework } from "@/lib/azure-ai";

const bodySchema = z.object({
  chunkId: z.number(),
});

export async function POST(request: Request) {
  try {
    const { chunkId } = bodySchema.parse(await request.json());
    const db = getDb();
    const [chunk] = await db
      .select()
      .from(chunks)
      .where(eq(chunks.id, chunkId));
    if (!chunk) {
      return NextResponse.json({ error: "Chunk not found" }, { status: 404 });
    }

    const [aamc, usmle] = await Promise.all([
      alignToFramework(chunk.content, "AAMC"),
      alignToFramework(chunk.content, "USMLE"),
    ]);

    return NextResponse.json({ aamc, usmle });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Alignment failed" }, { status: 500 });
  }
}
