import { cn } from "@/lib/utils";

/**
 * A record list that renders as a stacked-card `<ul>` below the `sm`
 * breakpoint and a `<table>` at `sm` and up — CSS only decides which is
 * visible, so `rows` is mapped once and shared by both (avoids the doubled
 * per-row computation a hand-rolled sm:hidden/hidden:sm:block split invites).
 *
 * Shared by AlignmentTable and the gaps page's Coverage Table, which are both
 * "list of records" shapes. CoverageHeatmap is a 2D (case x system) matrix,
 * a genuinely different shape, and does not use this component.
 */
export function ResponsiveTable<T>({
  rows,
  rowKey,
  columns,
  renderMobileCard,
  rowClassName,
  stickyHeader,
}: {
  rows: T[];
  rowKey: (row: T) => string | number;
  columns: { header: string; cell: (row: T) => React.ReactNode; className?: string }[];
  renderMobileCard: (row: T) => React.ReactNode;
  rowClassName?: (row: T) => string;
  stickyHeader?: boolean;
}) {
  return (
    <>
      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)}>{renderMobileCard(row)}</li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className={cn(stickyHeader && "sticky top-0 bg-white")}>
            <tr className="border-b text-left text-rush-medium">
              {columns.map((col) => (
                <th key={col.header} className={cn("pb-2", col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className={cn("border-b", rowClassName?.(row) ?? "border-gray-100")}>
                {columns.map((col) => (
                  <td key={col.header} className={cn("py-2", col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
