"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type CaseItem = {
  id: number;
  caseNumber: number;
  caseTitle: string | null;
  diagnosis?: string | null;
};

type SidebarProps = {
  courseId: number;
  courseCode: string;
  courseTitle: string;
  director: string | null;
  cases: CaseItem[];
};

const navItems = [
  { href: "", label: "Dashboard" },
  { href: "/map", label: "Curriculum Map" },
  { href: "/objectives", label: "Learning Objectives" },
  { href: "/gaps", label: "Gap Analysis" },
  { href: "/search", label: "Search" },
];

export function Sidebar({
  courseId,
  courseCode,
  courseTitle,
  director,
  cases,
}: SidebarProps) {
  const pathname = usePathname();
  const base = `/courses/${courseId}`;

  return (
    <aside className="w-60 shrink-0 bg-rush-dark text-white">
      <div className="border-b border-rush-medium p-4">
        <p className="font-heading text-lg font-bold">{courseCode}</p>
        <p className="text-sm text-gray-300">{courseTitle}</p>
        {director && (
          <p className="mt-2 text-xs text-gray-400">{director}</p>
        )}
      </div>
      <nav className="p-2">
        {navItems.map((item) => {
          const href = `${base}${item.href}`;
          const active =
            item.href === ""
              ? pathname === base
              : pathname.startsWith(href);
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "mb-1 block rounded-r px-4 py-2 text-sm transition-colors",
                active
                  ? "border-l-4 border-rush-green bg-rush-medium"
                  : "hover:bg-rush-medium/60",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-rush-medium p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Cases
        </p>
        <ul className="space-y-2 text-sm">
          {cases.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-covered-green" />
              <span>
                Case {c.caseNumber}: {c.caseTitle}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
