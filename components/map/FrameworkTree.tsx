type Node = { id: string; label: string };

type Props = {
  title: string;
  nodes: Node[];
  alignedIds: Set<string | null>;
  onSelectNode: (id: string) => void;
};

export function FrameworkTree({
  title,
  nodes,
  alignedIds,
  onSelectNode,
}: Props) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-3 font-heading font-semibold">{title}</h3>
      <ul className="max-h-[480px] space-y-1 overflow-y-auto text-sm">
        {nodes.map((node) => {
          const aligned = alignedIds.has(node.id);
          return (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onSelectNode(node.id)}
                className={`w-full rounded px-2 py-1 text-left transition-colors ${
                  aligned
                    ? "bg-green-100 font-medium text-green-900 ring-1 ring-green-300"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
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
