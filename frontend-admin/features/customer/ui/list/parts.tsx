"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type { SortDir } from "@/lib/sort";
import { userLang } from "../../model/user";
import type { UserCardDto, UserSortBy } from "../../model/types";

/** Бейдж языка: сплошной — выбран в магазине; пунктирный с «TG» — язык Telegram как запасной. */
export function LangCell({ u }: { u: UserCardDto }) {
  const l = userLang(u);
  if (l.label === "—") return <span className="text-[var(--text-faint)]">—</span>;
  return (
    <span
      title={l.fromTelegram ? "Язык не выбран в магазине — показан язык Telegram" : "Язык, выбранный в магазине"}
      className={
        l.fromTelegram
          ? "inline-flex items-center gap-0.5 rounded-[var(--r-sm)] border border-dashed border-[var(--line-strong)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-faint)]"
          : "inline-flex items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text)]"
      }
    >
      {l.label}
      {l.fromTelegram && <sup className="text-[8px]">TG</sup>}
    </span>
  );
}

export function SortableTh({
  label,
  col,
  sortBy,
  sortDir,
  toggleSort,
  className,
}: {
  label: string;
  col: UserSortBy;
  /** E.g. `hidden xl:table-cell` for a column shown only on wide screens. */
  className?: string;
  sortBy: UserSortBy;
  sortDir: SortDir;
  toggleSort: (c: UserSortBy) => void;
}) {
  const active = sortBy === col;
  return (
    <th className={className} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={`flex items-center gap-1 uppercase tracking-[inherit] transition-colors hover:text-[var(--text)] ${
          active ? "text-[var(--accent-hi)]" : ""
        }`}
      >
        {label}
        {active &&
          (sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </th>
  );
}
