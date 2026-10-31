"use client";

import { cn } from "@/lib/cn";
import type { OrderSortBy, SortDir } from "@/lib/api";

interface Props {
  col: OrderSortBy;
  label: string;
  align?: "left" | "right";
  sortBy: OrderSortBy;
  sortDir: SortDir;
  onSort: (col: OrderSortBy) => void;
}

function ariaSort(active: boolean, dir: SortDir): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

/** Clickable table header that sorts by `col` and shows a ↑/↓ when active. */
export function SortHeader({ col, label, align = "left", sortBy, sortDir, onSort }: Props) {
  const active = sortBy === col;
  const arrow = active ? (sortDir === "asc" ? "↑" : "↓") : "";
  return (
    // aria-sort is a property of the column header, not of the button inside it.
    <th className={cn(align === "right" && "r")} aria-sort={ariaSort(active, sortDir)}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          // Preflight resets text-transform on <button>: re-inherit the header's caps/tracking.
          "inline-flex items-baseline gap-1 uppercase tracking-[inherit] transition-colors hover:text-[var(--text)]",
          align === "right" && "flex-row-reverse",
          active && "text-[var(--accent-hi)]"
        )}
      >
        {label}
        <span className="text-[10px] leading-none">{arrow}</span>
      </button>
    </th>
  );
}
