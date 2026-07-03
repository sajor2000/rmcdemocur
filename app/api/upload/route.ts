export const maxDuration = 60;

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { documents, processingJobs } from "@/drizzle/schema";
import { getDb } from "@/lib/db";
import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_BYTES,
} from "@/lib/document-parser";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const courseId = Number(formData.get("courseId") ?? 1);

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const destDir = path.join(process.cwd(), "data/curriculum");
    await fs.mkdir(destDir, { recursive: true });
    const safeName = path.basename(file.name);
    const destPath = path.join(destDir, safeName);
    if (!destPath.startsWith(destDir)) {
      return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    }
    await fs.writeFile(destPath, buffer);

    const db = getDb();
    const [doc] = await db
      .insert(documents)
      .values({
        courseId,
        filename: safeName,
        fileType: ext.slice(1),
        caseTitle: file.name,
      })
      .returning();

    const [job] = await db
      .insert(processingJobs)
      .values({
        documentId: doc.id,
        stage: "queued",
        progress: 0,
        message: "Queued for processing",
        status: "queued",
      })
      .returning();

    return NextResponse.json({ jobId: job.id, documentId: doc.id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
