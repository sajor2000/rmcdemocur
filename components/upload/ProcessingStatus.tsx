import { Progress } from "@/components/ui/progress";

const STAGES = [
  "Parsing document...",
  "Extracting learning objectives (regex-first)...",
  "Chunking content into 500-token segments...",
  "Generating embeddings (Azure AI Foundry)...",
  "Running alignment analysis against AAMC PCRS...",
  "Running alignment analysis against USMLE 2025...",
  "Tagging AAMC keywords...",
];

type Props = {
  stage?: string;
  progress?: number;
  message?: string;
  status?: string;
};

export function ProcessingStatus({ stage, progress = 0, message, status }: Props) {
  return (
    <div className="rounded-lg border bg-white p-6">
      <h3 className="font-heading font-semibold">Processing Status</h3>
      <Progress value={progress} className="mt-4" />
      <p className="mt-2 font-mono text-sm">{message ?? stage}</p>
      <ul className="mt-4 space-y-1 text-sm text-rush-medium">
        {STAGES.map((s) => (
          <li key={s} className={message?.includes(s.slice(0, 10)) ? "text-rush-green" : ""}>
            {s}
          </li>
        ))}
        {status === "complete" && (
          <li className="font-medium text-rush-green">✓ Processing complete</li>
        )}
      </ul>
    </div>
  );
}
