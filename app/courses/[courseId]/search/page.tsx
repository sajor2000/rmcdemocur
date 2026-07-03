"use client";

import { useState } from "react";
import { SearchBar } from "@/components/search/SearchBar";
import { AiAnswerBox } from "@/components/search/AiAnswerBox";
import { SearchResult } from "@/components/search/SearchResult";

const EXAMPLES = [
  "Which activities address AAMC EPA 5?",
  "Show me all content about H. pylori",
  "What USMLE Step 1 topics are covered in Case 4?",
  "Find gaps in hepatobiliary coverage",
];

type Result = {
  filename: string;
  section: string | null;
  content: string;
  similarity: number;
};

export default function SearchPage({
  params,
}: {
  params: { courseId: string };
}) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setQuery(q);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, courseId: Number(params.courseId) }),
      });
      const data = await res.json();
      setAnswer(data.answer ?? "");
      setResults(data.results ?? []);
    } catch {
      setAnswer("Search unavailable — configure DATABASE_URL and Azure credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">Natural Language Search</h1>
      <SearchBar
        value={query}
        onChange={setQuery}
        onSubmit={() => runSearch(query)}
        loading={loading}
      />
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => runSearch(ex)}
            className="rounded-full border border-rush-green/30 bg-white px-3 py-1 text-xs hover:bg-green-50"
          >
            {ex}
          </button>
        ))}
      </div>
      {answer && <AiAnswerBox answer={answer} />}
      <div className="space-y-4">
        {results.map((r, i) => (
          <SearchResult key={i} result={r} query={query} />
        ))}
      </div>
    </div>
  );
}
