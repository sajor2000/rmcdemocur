"use client";

import { useState } from "react";
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
  // Off-canvas drawer below lg; static column on lg+. State only drives mobile.
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open course navigation"
        className="fixed left-3 top-[4.5rem] z-30 rounded-md bg-rush-dark px-3 py-2 text-sm font-medium text-white shadow-md lg:hidden"
      >
        ☰ Menu
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-60 shrink-0 overflow-y-auto bg-rush-dark text-white transition-transform duration-200",
          "lg:static lg:z-auto lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-start justify-between border-b border-rush-medium p-4">
          <div>
            <p className="font-heading text-lg font-bold">{courseCode}</p>
            <p className="text-sm text-gray-300">{courseTitle}</p>
            {director && <p className="mt-2 text-xs text-gray-400">{director}</p>}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close course navigation"
            className="-mr-1 text-2xl leading-none text-gray-300 lg:hidden"
          >
            ×
          </button>
        </div>
        <nav className="p-2">
          {navItems.map((item) => {
            const href = `${base}${item.href}`;
            const active =
              item.href === "" ? pathname === base : pathname.startsWith(href);
            return (
              <Link
                key={item.href}
                href={href}
                onClick={() => setOpen(false)}
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
            {cases.map((c) => {
              const caseHref = `${base}/cases/${c.caseNumber}`;
              const caseActive = pathname === caseHref;
              return (
                <li key={c.caseNumber}>
                  <Link
                    href={caseHref}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-start gap-2 rounded px-1 py-0.5 transition-colors hover:bg-rush-medium/40",
                      caseActive && "bg-rush-medium/60",
                    )}
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-covered-green" />
                    <span>
                      Case {c.caseNumber}: {c.caseTitle}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </>
  );
}
