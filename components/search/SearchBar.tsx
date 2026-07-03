import { Button } from "@/components/ui/button";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
};

export function SearchBar({ value, onChange, onSubmit, loading }: Props) {
  return (
    <div className="flex gap-2">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder="Ask anything about RMD 563... e.g., 'What content covers USMLE GI objectives?'"
        className="flex-1 rounded-lg border border-gray-200 px-4 py-3 text-sm shadow-sm focus:border-rush-green focus:outline-none focus:ring-2 focus:ring-rush-green/20"
      />
      <Button onClick={onSubmit} disabled={loading}>
        {loading ? "Searching..." : "Search"}
      </Button>
    </div>
  );
}
