import { getAzureClient } from "@/lib/azure-ai";

// Strict per the plan (docs/plans/2026-07-03-009-*, U10): transcribe visible
// text verbatim, one factual description sentence, no speculative diagnosis.
// This is a caption-of-last-resort for figures with no other caption source
// (not CSV-imported, not derived from surrounding document text), so it must
// not introduce clinical claims the source document doesn't already state.
const SYSTEM_PROMPT = `You caption medical curriculum figures for search indexing, not for clinical use.

Rules:
1. If the image contains visible text (labels, captions, axis titles), transcribe it verbatim first.
2. Add exactly one factual sentence describing what the image depicts (e.g. "A line graph showing X plotted against Y" or "An endoscopic photograph of the distal esophagus").
3. Do not speculate about a diagnosis, clinical significance, or interpretation beyond what is explicitly labeled in the image.
4. Do not add clinical recommendations or educational commentary.
5. If the image is illegible or contains no meaningful content, respond with exactly: NO_CONTENT`;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
};

/**
 * Describes a single figure image via the existing gpt-4.1 chat deployment's
 * vision input (no new model deployment). Returns null when the model
 * reports NO_CONTENT (an illegible or empty image) -- the caller should skip
 * writing a caption for that row rather than storing a placeholder.
 */
export async function describeFigureImage(
  imageBytes: Buffer,
  ext: string,
): Promise<string | null> {
  const chatDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_CHAT!;
  const client = getAzureClient(chatDeployment);
  const contentType = CONTENT_TYPE_BY_EXT[ext.toLowerCase()] ?? "image/png";
  const base64 = imageBytes.toString("base64");

  const response = await client.chat.completions.create({
    model: chatDeployment,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Caption this curriculum figure." },
          { type: "image_url", image_url: { url: `data:${contentType};base64,${base64}` } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 300,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content || content === "NO_CONTENT") return null;
  return content;
}
