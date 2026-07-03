import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { alignments } from "@/drizzle/schema";
import { getDb } from "@/lib/db";

const bodySchema = z.object({
  status: z.enum(["approved", "rejected", "pending"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: { alignmentId: string } },
) {
  try {
    const body = bodySchema.parse(await request.json());
    const db = getDb();
    const [updated] = await db
      .update(alignments)
      .set({ status: body.status })
      .where(eq(alignments.id, Number(params.alignmentId)))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
