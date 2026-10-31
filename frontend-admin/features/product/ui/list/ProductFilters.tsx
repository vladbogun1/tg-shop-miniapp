"use client";

import { LayoutGrid, List as ListIcon, RotateCcw, Search } from "lucide-react";
import type { ProductCondition } from "@shop/core/catalog";
import { Button } from "@shop/ui/admin-button";
import { CategoryTreeSelect, CONDITION_OPTIONS, type AdminBrand, type AdminCategory } from "@/features/catalog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import {
  NO_BRAND,
  NO_CATEGORY,
  SORT_OPTIONS,
  type CardFilter,
  type SortKey,
  type StatusFilter,
  type StatusOption,
  type ViewMode,
} from "../../model/list";

interface Props {
  archivedView: boolean;
  search: string;
  setSearch: (v: string) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  categories: AdminCategory[];
  brands: AdminBrand[];
  categoryId: string;
  setCategoryId: (v: string) => void;
  brandId: string;
  setBrandId: (v: string) => void;
  cardFilter: CardFilter;
  setCardFilter: (v: CardFilter) => void;
  condition: "" | ProductCondition;
  setCondition: (v: "" | ProductCondition) => void;
  activeFilters: number;
  resetFilters: () => void;
  status: StatusFilter;
  setStatus: (v: StatusFilter) => void;
  statusChips: StatusOption[];
}

/** Поиск, сортировка, переключатель вида, фильтры и чипы статусов с числами. */
export function ProductFilters({
  archivedView, search, setSearch, sort, setSort, view, setView, categories, brands, categoryId, setCategoryId,
  brandId, setBrandId, cardFilter, setCardFilter, condition, setCondition, activeFilters, resetFilters, status, setStatus,
  statusChips: statusOptions,
}: Props) {
  const brandOptions = [
    { value: "", label: "Все бренды" },
    { value: NO_BRAND, label: "Без бренда" },
    ...[...brands].sort((a, b) => a.name.localeCompare(b.name)).map((b) => ({ value: b.id, label: `${b.name} · ${b.productCount}` })),
  ];
  return (
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Input
              label="Поиск по названию"
              
              placeholder="Например, клавиатура…"
              icon={<Search className="h-4 w-4" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-w-[210px]">
            <Select<SortKey>
              label="Сортировка"
              value={sort}
              onChange={(v) => setSort(v)}
              options={SORT_OPTIONS}
            />
          </div>
          {/* Same height as the fields beside it (40 / 44 on touch), segmented-control look. */}
          <div className="flex items-center gap-2">
            <div className="inline-flex h-10 items-center gap-0.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-[3px] pointer-coarse:h-11">
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="Список"
                aria-pressed={view === "list"}
                className={cn(
                  "hit grid h-full w-9 place-items-center rounded-[var(--r-sm)] border transition-colors pointer-coarse:w-11",
                  view === "list"
                    ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
                )}
              >
                <ListIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView("cards")}
                aria-label="Карточки"
                aria-pressed={view === "cards"}
                className={cn(
                  "hit grid h-full w-9 place-items-center rounded-[var(--r-sm)] border transition-colors pointer-coarse:w-11",
                  view === "cards"
                    ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 items-end gap-3 xl:grid-cols-[minmax(220px,1.4fr)_1fr_1fr_1fr_auto]">
          <CategoryTreeSelect
            className="col-span-2 xl:col-span-1"
            label="Категория"
            mode="any"
            showCounts
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Все категории"
            extra={[
              { value: "", label: "Все категории" },
              { value: NO_CATEGORY, label: "Без категории" },
            ]}
          />
          <Select label="Бренд" value={brandId} onChange={setBrandId} placeholder="Все бренды" options={brandOptions} />
          <Select<CardFilter>
            label="Карточка"
            value={cardFilter}
            onChange={setCardFilter}
            placeholder="Любая"
            options={[
              { value: "", label: "Любая" },
              { value: "DRAFT", label: "Черновик" },
              { value: "AI_FILLED", label: "От ИИ" },
              { value: "READY", label: "Проверена" },
              { value: "INCOMPLETE", label: "Неполная" },
            ]}
          />
          <Select<"" | ProductCondition>
            label="Состояние"
            value={condition}
            onChange={setCondition}
            placeholder="Любое"
            options={[{ value: "", label: "Любое" }, ...CONDITION_OPTIONS]}
          />
          {activeFilters > 0 ? (
            <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={resetFilters}>
              Сбросить · {activeFilters}
            </Button>
          ) : (
            <span className="hidden xl:block" />
          )}
        </div>

        {!archivedView && (
          // Status chips with counts are wider than a phone: scroll them, not the page.
          <div className="thin-scroll -mx-1 max-w-full overflow-x-auto px-1 pb-1">
            <SegmentedControl<StatusFilter>
              options={statusOptions}
              value={status}
              onChange={setStatus}
              className="whitespace-nowrap"
            />
          </div>
        )}
      </div>
  );
}
