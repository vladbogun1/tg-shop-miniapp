"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import type { treeStats } from "../../model/tree-view";
import { plural } from "../../model/words";

/** Поиск и счётчики над деревом. */
export function CategoriesToolbar({
  search,
  onSearch,
  stats,
}: {
  search: string;
  onSearch: (v: string) => void;
  stats: ReturnType<typeof treeStats>;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-[220px] max-w-sm flex-1">
        <Input
          aria-label="Поиск категории"
          placeholder="Найти категорию…"
          icon={<Search className="h-4 w-4" />}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
        <span>
          <b className="tabular text-[var(--text)]">{stats.roots}</b> корневых
        </span>
        <span>
          <b className="tabular text-[var(--text)]">{stats.subs}</b> {plural(stats.subs, "подкатегория", "подкатегории", "подкатегорий")}
        </span>
        <span>
          <b className="tabular text-[var(--text)]">{stats.products}</b> на витрине
        </span>
        {stats.hidden > 0 && (
          <span>
            <b className="tabular text-[var(--text)]">{stats.hidden}</b> скрыто из меню
          </span>
        )}
      </div>
    </div>
  );
}
