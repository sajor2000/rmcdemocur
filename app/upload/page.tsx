"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { DropZone } from "@/components/upload/DropZone";
import { ProcessingStatus } from "@/components/upload/ProcessingStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SAMPLE_CASES } from "@/lib/demo-data";

export default function UploadPage() {
  const [jobId, setJobId] = useState<number | null>(null);
  const [status, setStatus] = useState<{
    stage?: string;
    progress?: number;
    message?: string;
    status?: string;
  } | null>(null);

  const handleUpload = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("courseId", "1");

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Upload failed");
      return;
    }

    const { jobId: id } = await res.json();
    setJobId(id);
    setStatus({ stage: "queued", progress: 0, message: "Queued...", status: "queued" });

    await fetch(`/api/upload/${id}/advance`, { method: "POST" });

    const es = new EventSource(`/api/upload/${id}/stream`);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStatus(data);
      if (data.status === "complete" || data.status === "failed") {
        es.close();
        if (data.status === "complete") toast.success("Processing complete");
      }
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-bold">Upload & Processing</h1>
      <p className="mt-2 text-rush-medium">
        Drop faculty guides to parse, embed, and align against AAMC and USMLE frameworks.
      </p>

      <div className="mt-8">
        <label className="mb-2 block text-sm font-medium">Course</label>
        <select className="w-full rounded-md border border-gray-200 bg-white px-3 py-2" defaultValue="1">
          <option value="1">RMD 563 — Food to Fuel</option>
        </select>
      </div>

      <div className="mt-6">
        <DropZone onUpload={handleUpload} />
      </div>

      {status && (
        <div className="mt-6">
          <ProcessingStatus {...status} />
        </div>
      )}

      <Card className="mt-10">
        <CardHeader>
          <CardTitle>Sample cases — illustrative only</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-rush-medium">
            Example RMD 563 cases showing the expected shape of processed content. This is
            sample data, not live processing status — see the dashboard for real results.
          </p>
          <ul className="space-y-2 text-sm">
            {SAMPLE_CASES.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded border p-3">
                <span>
                  Case {c.caseNumber}: {c.caseTitle}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  sample
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
