import { NextResponse } from "next/server";
import { z } from "zod";
import { generateEmbedding, synthesizeSearchAnswer } from "@/lib/azure-ai";
import {
  checkRateLimit,
  clientRateLimitKey,
} from "@/lib/rate-limit";
import { searchChunks } from "@/lib/queries";

const bodySchema = z.object({
  query: z.string().min(2),
  courseId: z.number(),
});

export async function POST(request: Request) {
  const rateKey = clientRateLimitKey(request, "search");
  if (!checkRateLimit(rateKey, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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
      sourcePage: (r.source_page as number | null) ?? null,
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
