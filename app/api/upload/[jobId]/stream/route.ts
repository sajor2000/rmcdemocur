import { eq } from "drizzle-orm";
import { processingJobs } from "@/drizzle/schema";
import { getDb } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: { jobId: string } },
) {
  const jobId = Number(params.jobId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };

      const pollIntervalMs = 1000;
      const maxAttempts = 3600;

      for (let attempts = 0; attempts < maxAttempts; attempts++) {
        try {
          const db = getDb();
          const [job] = await db
            .select()
            .from(processingJobs)
            .where(eq(processingJobs.id, jobId));

          if (!job) {
            send({ error: "Job not found" });
            break;
          }

          send({
            stage: job.stage,
            progress: job.progress,
            message: job.message,
            status: job.status,
          });

          if (job.status === "complete" || job.status === "failed") {
            break;
          }
        } catch (error) {
          console.error(error);
          send({ error: "Stream error" });
          break;
        }

        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
