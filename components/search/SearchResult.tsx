import { Badge } from "@/components/ui/badge";
import { confidenceBadgeClass } from "@/lib/utils";

type Props = {
  result: {
    filename: string;
    section: string | null;
    content: string;
    similarity: number;
  };
  query: string;
};

export function SearchResult({ result, query }: Props) {
  const highlight = (text: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-rush-yellow/60">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-xs text-rush-medium">
        {result.filename} › {result.section ?? "Section"}
      </p>
      <p className="mt-2 text-sm">{highlight(result.content.slice(0, 300))}</p>
      <div className="mt-3 flex gap-2">
        <Badge className={confidenceBadgeClass(result.similarity)}>
          {result.similarity.toFixed(2)} similarity
        </Badge>
      </div>
    </div>
  );
}
