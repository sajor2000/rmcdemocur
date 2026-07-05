type Node = { id: string; label: string };

type Props = {
  title: string;
  nodes: Node[];
  /** Nodes to highlight — aligned overview, or the current selection's links. */
  highlightIds: Set<string | null>;
  /** The node the user clicked (framework-side selection). */
  selectedId?: string | null;
  /** A selection is active elsewhere — mute non-highlighted nodes. */
  dim?: boolean;
  onSelectNode: (id: string) => void;
};

export function FrameworkTree({
  title,
  nodes,
  highlightIds,
  selectedId,
  dim = false,
  onSelectNode,
}: Props) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-3 font-heading font-semibold">{title}</h3>
      <ul className="max-h-[480px] space-y-1 overflow-y-auto text-sm">
        {nodes.map((node) => {
          const highlighted = highlightIds.has(node.id);
          const selected = selectedId != null && node.id === selectedId;
          const cls = selected
            ? "bg-green-50 font-semibold text-green-900 ring-2 ring-rush-green"
            : highlighted
              ? "bg-green-100 font-medium text-green-900 ring-1 ring-green-300"
              : dim
                ? "text-gray-300"
                : "text-gray-500 hover:bg-gray-50";
          return (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onSelectNode(node.id)}
                className={`w-full rounded px-2 py-1 text-left transition-colors ${cls}`}
              >
                {node.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
