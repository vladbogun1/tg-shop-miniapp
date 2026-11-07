"use client";

import { ChevronsDownUp, ChevronsUpDown, CheckSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@shop/ui/admin-button";
import { CATEGORY_FILTER_LABEL, type CategoryFilter } from "../../model/tree-filter";
import type { treeStats } from "../../model/tree-view";
import { plural } from "../../model/words";
import { FilterChip, StickyToolbar } from "../BulkBar";

const CHIPS: CategoryFilter[] = ["hidden", "nospecs", "noproducts", "seo"];

/** Липкий тулбар: поиск, счётчики, «Выбрать», «Свернуть/Развернуть все» и чипы-фильтры. */
export function CategoriesToolbar({
  search,
  onSearch,
  stats,
  filters,
  counts,
  onFilter,
  allCollapsed,
  onCollapseAll,
  selectMode,
  onSelectMode,
}: {
  search: string;
  onSearch: (v: string) => void;
  stats: ReturnType<typeof treeStats>;
  filters: ReadonlySet<CategoryFilter>;
  counts: Record<CategoryFilter, number>;
  onFilter: (f: CategoryFilter) => void;
  allCollapsed: boolean;
  onCollapseAll: () => void;
  selectMode: boolean;
  onSelectMode: () => void;
}) {
  const Fold = allCollapsed ? ChevronsUpDown : ChevronsDownUp;
  return (
    <StickyToolbar>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[200px] max-w-sm flex-1">
          <Input
            aria-label="Поиск категории"
            placeholder="Найти категорию…"
            icon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <Button size="sm" variant="outline" icon={<Fold className="h-3.5 w-3.5" />} onClick={onCollapseAll}>
          {allCollapsed ? "Развернуть все" : "Свернуть все"}
        </Button>
        <Button size="sm" variant={selectMode ? "accent" : "outline"} icon={<CheckSquare className="h-3.5 w-3.5" />} onClick={onSelectMode} aria-pressed={selectMode}>
          Выбрать
        </Button>
        <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
          <span>
            <b className="tabular text-[var(--text)]">{stats.roots}</b> корневых
          </span>
          <span>
            <b className="tabular text-[var(--text)]">{stats.subs}</b> {plural(stats.subs, "подкатегория", "подкатегории", "подкатегорий")}
          </span>
          <span title="Активные товары категорий верхнего уровня, вместе с подкатегориями">
            <b className="tabular text-[var(--text)]">{stats.products}</b> на витрине
          </span>
        </div>
      </div>
      <div className="thin-scroll mt-2 flex gap-2 overflow-x-auto pb-0.5">
        {CHIPS.map((f) => (
          <FilterChip key={f} active={filters.has(f)} onClick={() => onFilter(f)} count={counts[f]}>
            {CATEGORY_FILTER_LABEL[f]}
          </FilterChip>
        ))}
      </div>
    </StickyToolbar>
  );
}
