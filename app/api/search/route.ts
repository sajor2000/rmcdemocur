import { NextResponse } from "next/server";
import { z } from "zod";
import { generateEmbedding, synthesizeSearchAnswer } from "@/lib/azure-ai";
import { searchChunks } from "@/lib/queries";

const bodySchema = z.object({
  query: z.string().min(2),
  courseId: z.number(),
});

export async function POST(request: Request) {
  try {
    const { query, courseId } = bodySchema.parse(await request.json());
    const embedding = await generateEmbedding(query);
    const rows = await searchChunks(courseId, embedding, 5);

    const contexts = rows.map((r) => ({
      section: (r.section as string) ?? null,
      filename: r.filename as string,
      content: r.content as string,
      similarity: Number(r.similarity),
      chunkId: Number(r.id),
    }));

    let answer = "Configure Azure OpenAI to generate synthesized answers.";
    try {
      answer = await synthesizeSearchAnswer(query, contexts);
    } catch {
      answer = `Found ${contexts.length} relevant sections for: ${query}`;
    }

    return NextResponse.json({ answer, results: contexts });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
