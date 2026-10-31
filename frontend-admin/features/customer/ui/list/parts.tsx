"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type { SortDir } from "@/lib/api";
import { userLang } from "../../model/user";
import type { UserCardDto, UserSortBy } from "../../model/types";

export function LangCell({ u }: { u: UserCardDto }) {
  const l = userLang(u);
  return (
    <span
      title={l.fromTelegram ? "Язык не выбран в магазине — показан язык Telegram" : "Язык, выбранный в магазине"}
      className={l.fromTelegram ? "text-[var(--text-faint)]" : "font-semibold text-[var(--text)]"}
    >
      {l.label}
      {l.fromTelegram && <sup className="ml-0.5 text-[9px]">TG</sup>}
    </span>
  );
}

export function SortableTh({
  label,
  col,
  sortBy,
  sortDir,
  toggleSort,
}: {
  label: string;
  col: UserSortBy;
  sortBy: UserSortBy;
  sortDir: SortDir;
  toggleSort: (c: UserSortBy) => void;
}) {
  const active = sortBy === col;
  return (
    <th aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
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
