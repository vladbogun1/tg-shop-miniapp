"use client";

import { ArrowDownAZ, ArrowDownNarrowWide, ArrowDownUp, ArrowUpNarrowWide, Check, Flame, Search, SlidersHorizontal, X } from "lucide-react";
import type { MessageKey } from "@/i18n/ru";
import { useI18n } from "@/i18n/context";
import { haptic } from "@/platform/telegram";
import type { SortKey } from "../model/sort";
import type { HomeState } from "./use-home";

const SORTS: { key: SortKey; labelKey: MessageKey; Icon: typeof Flame }[] = [
  { key: "popular", labelKey: "catalog.sort.popular", Icon: Flame },
  { key: "price_asc", labelKey: "catalog.sort.priceAsc", Icon: ArrowUpNarrowWide },
  { key: "price_desc", labelKey: "catalog.sort.priceDesc", Icon: ArrowDownNarrowWide },
  { key: "name", labelKey: "catalog.sort.name", Icon: ArrowDownAZ },
];

/** Search field · filters button · sort menu. */
export function SearchRow({ h }: { h: HomeState }) {
  const { t } = useI18n();
  const { search, setSearch, filterCount, setSortOpen, setFiltersOpen, sort, setSort, sortOpen } = h;
  return (
          <div className="flex items-stretch gap-2">
            <div className="flex flex-1 items-center gap-2.5 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
              <Search className="h-[18px] w-[18px] shrink-0 text-[var(--muted)]" strokeWidth={2.25} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("catalog.search")}
                aria-label={t("catalog.search")}
                enterKeyHint="search"
                className="w-full min-h-0 bg-transparent text-[15px] font-medium text-[var(--ink)] outline-none placeholder:font-normal placeholder:text-[var(--faint)]"
              />
              {search && (
                <button
                  type="button"
                  aria-label={t("catalog.searchClear")}
                  onClick={() => {
                    haptic();
                    setSearch("");
                  }}
                  className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              )}
            </div>
    
            {/* filters */}
            <button
              type="button"
              aria-label={t("catalog.filters")}
              onClick={() => {
                haptic();
                setSortOpen(false);
                setFiltersOpen(true);
              }}
              className={`nb-press tap relative grid w-[52px] shrink-0 place-items-center rounded-[var(--r)] border ${
                filterCount > 0
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                  : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
              }`}
            >
              <SlidersHorizontal className="h-5 w-5" strokeWidth={2.25} />
              {filterCount > 0 && (
                <span className="font-display absolute -right-1.5 -top-1.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10.5px] font-bold leading-none text-[var(--accent-ink)]">
                  {filterCount}
                </span>
              )}
            </button>
    
            {/* sort */}
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={t("catalog.sort")}
                onClick={() => {
                  haptic();
                  setSortOpen((o) => !o);
                }}
                className={`nb-press tap grid h-full w-[52px] place-items-center rounded-[var(--r)] border ${
                  sort !== "popular"
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                    : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
                }`}
              >
                <ArrowDownUp className="h-5 w-5" strokeWidth={2.25} />
              </button>
    
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                  <div className="nb-lg absolute right-0 top-full z-50 mt-2 w-64 border-[var(--line-strong)] p-1.5">
                    <p className="eyebrow px-2.5 pb-1.5 pt-1.5 !text-[10px]">
                      {t("catalog.sort")}
                    </p>
                    {SORTS.map(({ key, labelKey, Icon }) => {
                      const on = sort === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            haptic();
                            setSort(key);
                            setSortOpen(false);
                          }}
                          className={`font-display flex w-full items-center gap-2.5 rounded-[var(--r)] px-3 py-2.5 text-left text-[14px] font-semibold ${
                            on ? "bg-[var(--accent-soft)] text-[var(--accent-hi)]" : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                          <span className="flex-1">{t(labelKey)}</span>
                          {on && <Check className="h-4 w-4 shrink-0" strokeWidth={2.75} />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
  );
}
