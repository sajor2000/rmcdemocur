import OpenAI from "openai";
import type { AlignmentResult } from "@/lib/alignment-prompts";
import {
  buildAlignmentSystemPrompt,
  normalizeAlignmentIds,
  validateAlignments,
} from "@/lib/framework-catalog";
import { resolveFrameworkCandidates } from "@/lib/framework-rag";

function getAzureClient(deployment: string) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "");
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview";

  if (!endpoint || !apiKey) {
    throw new Error("Azure OpenAI credentials are not configured");
  }
  if (!deployment) {
    throw new Error("Azure OpenAI deployment name is not configured");
  }

  // Azure requires the deployment name in the URL path, not only in the request body.
  return new OpenAI({
    apiKey,
    baseURL: `${endpoint}/openai/deployments/${deployment}`,
    defaultQuery: { "api-version": apiVersion },
    defaultHeaders: { "api-key": apiKey },
  });
}

/** pgvector columns are vector(1536); large models need an explicit dimensions cap. */
export function resolveEmbeddingDimensions(): number | undefined {
  const fromEnv = process.env.AZURE_OPENAI_EMBEDDING_DIMENSIONS?.trim();
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  const deployment = (process.env.AZURE_OPENAI_DEPLOYMENT_EMBED ?? "").toLowerCase();
  if (deployment.includes("large")) return 1536;
  return undefined;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_EMBED!;
  const client = getAzureClient(deployment);
  const dimensions = resolveEmbeddingDimensions();
  const response = await client.embeddings.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_EMBED!,
    input: text,
    ...(dimensions !== undefined ? { dimensions } : {}),
  });
  return response.data[0].embedding;
}

export async function alignToFramework(
  chunkText: string,
  framework: "AAMC" | "USMLE",
  options?: {
    chunkEmbedding?: number[];
  },
): Promise<AlignmentResult[]> {
  const chatDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_CHAT!;
  const client = getAzureClient(chatDeployment);

  let chunkEmbedding = options?.chunkEmbedding;
  if (!chunkEmbedding) {
    try {
      chunkEmbedding = await generateEmbedding(chunkText);
    } catch {
      chunkEmbedding = undefined;
    }
  }

  const candidates = await resolveFrameworkCandidates(
    framework,
    chunkText,
    chunkEmbedding,
  );

  if (candidates.length === 0) {
    console.warn(
      `No ${framework} catalog candidates for chunk — skipping alignment (fail-closed).`,
    );
    return [];
  }

  const systemPrompt = buildAlignmentSystemPrompt(framework, candidates);

  const response = await client.chat.completions.create({
    model: chatDeployment,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: chunkText },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 1000,
  });

  const content = response.choices[0].message.content;
  if (!content) return [];

  let parsed: AlignmentResult[];
  try {
    const result = JSON.parse(content) as { alignments: AlignmentResult[] };
    parsed = normalizeAlignmentIds(result.alignments ?? [], framework);
  } catch {
    return [];
  }

  const allowed = new Set(candidates.map((c) => c.stableId));
  return validateAlignments(parsed, allowed, framework);
}

export async function synthesizeSearchAnswer(
  query: string,
  contexts: { section: string | null; filename: string; content: string }[],
): Promise<string> {
  const chatDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_CHAT!;
  const client = getAzureClient(chatDeployment);
  const contextBlock = contexts
    .map(
      (c, i) =>
        `[${i + 1}] ${c.filename} › ${c.section ?? "Section"}\n${c.content}`,
    )
    .join("\n\n");

  const response = await client.chat.completions.create({
    model: chatDeployment,
    messages: [
      {
        role: "system",
        content:
          "You are a Rush Medical College curriculum expert. Answer using only the provided excerpts. Cite sources by number like [1].",
      },
      {
        role: "user",
        content: `Question: ${query}\n\nContext:\n${contextBlock}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 800,
  });

  return response.choices[0].message.content ?? "No answer generated.";
}
