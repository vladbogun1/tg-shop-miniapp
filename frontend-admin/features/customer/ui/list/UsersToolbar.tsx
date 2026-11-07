"use client";

import { ArrowUpDown, Check, Crown, Search, ShoppingBag, UserX, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@shop/ui/admin-button";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { useUserMetrics } from "../../queries";
import { hasFilters, NO_FILTERS, toggleBlocked, toggleHasOrders, togglePremium, type UserFilters } from "../../model/filters";
import { MOBILE_SORTS, parseMobileSort, sortLabel, type Sorting } from "../../model/table";

const CHIP =
  "focusable hit inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[12.5px] font-semibold transition-colors pointer-coarse:h-11";

function Chip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        CHIP,
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
      )}
    >
      {children}
      {count !== undefined && <span className="tabular text-[11px] font-medium opacity-80">{count}</span>}
    </button>
  );
}

/**
 * Один ряд: поиск + чипы. Все фильтры серверные и работают вместе: «С заказами» / «Без заказов» (любой статус заказа),
 * Premium, «Заблокировали бота»; счётчики на чипах — по всей базе (метрики), не по поиску. На телефоне сортировка — в шторке (на ПК — заголовки таблицы).
 */
export function UsersToolbar({
  search,
  onSearch,
  filters,
  onFilters,
  sorting,
  onSorting,
}: {
  search: string;
  onSearch: (v: string) => void;
  filters: UserFilters;
  onFilters: (f: UserFilters) => void;
  sorting: Sorting;
  onSorting: (s: Sorting) => void;
}) {
  const [sheet, setSheet] = useState(false);
  const counts = useUserMetrics("month").data;
  const current = `${sorting.sortBy}:${sorting.sortDir}`;
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--line)] p-3 sm:p-4">
      <div className="min-w-[200px] flex-1">
        <Input
          placeholder="Поиск: имя, @username, ID"
          aria-label="Поиск пользователей"
          icon={<Search className="h-4 w-4" />}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          rightSlot={
            search ? (
              <button
                type="button"
                onClick={() => onSearch("")}
                aria-label="Очистить поиск"
                className="grid h-8 w-8 place-items-center text-[var(--text-faint)] hover:text-[var(--text)]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : undefined
          }
        />
      </div>
      <div className="thin-scroll flex max-w-full items-center gap-2 overflow-x-auto">
        <Chip active={!hasFilters(filters)} onClick={() => onFilters(NO_FILTERS)} count={counts?.totalUsers}>
          Все
        </Chip>
        <Chip active={filters.hasOrders === true} onClick={() => onFilters(toggleHasOrders(filters, true))} count={counts?.activeUsers}>
          <ShoppingBag className="h-3.5 w-3.5" />С заказами
        </Chip>
        <Chip active={filters.hasOrders === false} onClick={() => onFilters(toggleHasOrders(filters, false))} count={counts?.inactiveUsers}>
          Без заказов
        </Chip>
        <Chip active={filters.premiumOnly} onClick={() => onFilters(togglePremium(filters))} count={counts?.premiumUsers}>
          <Crown className="h-3.5 w-3.5" />
          Premium
        </Chip>
        <Chip active={filters.blockedOnly} onClick={() => onFilters(toggleBlocked(filters))} count={counts?.blockedUsers}>
          <UserX className="h-3.5 w-3.5" />
          Заблокировали
        </Chip>
      </div>
      {/* Phones have no sortable table headers — sort from a sheet. */}
      <Button variant="surface" size="md" className="md:hidden" icon={<ArrowUpDown className="h-4 w-4" />} onClick={() => setSheet(true)}>
        {sortLabel(sorting)}
      </Button>
      <ActionSheet
        open={sheet}
        title="Сортировка"
        onClose={() => setSheet(false)}
        actions={MOBILE_SORTS.map((o) => ({
          key: o.value,
          label: o.label,
          icon: o.value === current ? <Check className="h-4 w-4 text-[var(--accent)]" /> : <span className="h-4 w-4" />,
          onSelect: () => onSorting(parseMobileSort(o.value)),
        }))}
      />
    </div>
  );
}
