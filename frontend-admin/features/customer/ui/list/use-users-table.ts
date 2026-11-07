"use client";

import { useEffect, useMemo, useState } from "react";
import { useUsersTable } from "../../queries";
import { filtersKey, NO_FILTERS, type UserFilters } from "../../model/filters";
import { toggleSorting, type Sorting } from "../../model/table";
import type { UserCardDto, UserSortBy } from "../../model/types";

/**
 * Состояние списка: поиск (с задержкой 300 мс), фильтр, сортировка. Порции копятся (`useInfiniteQuery`),
 * смена условий начинает с первой порции; экран не размонтируется при открытии профиля, поэтому
 * загруженное и положение прокрутки сохраняются.
 */
export function useUsersTableState() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<UserFilters>(NO_FILTERS);
  const [sorting, setSorting] = useState<Sorting>({ sortBy: "createdAt", sortDir: "desc" });

  // «/users?q=<id>» из палитры Ctrl+K: поиск выставлен сразу, адрес очищен (после чтения, чтобы не вернулся при обновлении).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("q");
    if (!q) return;
    setSearch(q);
    setDebounced(q);
    sp.delete("q");
    const rest = sp.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useUsersTable({ q: debounced, filters, sortBy: sorting.sortBy, sortDir: sorting.sortDir });
  const rows = useMemo(() => {
    // Новые регистрации сдвигают границы порций — повторы по id отбрасываем.
    const seen = new Set<number>();
    const out: UserCardDto[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const u of page) {
        if (seen.has(u.telegramUserId)) continue;
        seen.add(u.telegramUserId);
        out.push(u);
      }
    }
    return out;
  }, [query.data]);

  return {
    search,
    setSearch,
    filters,
    setFilters,
    sorting,
    setSorting,
    toggleSort: (col: UserSortBy) => setSorting((s) => toggleSorting(s, col)),
    reset: () => {
      setSearch("");
      setDebounced("");
      setFilters(NO_FILTERS);
    },
    /** Меняется при смене условий — перезапускает анимацию списка. */
    resetKey: `${debounced}-${filtersKey(filters)}-${sorting.sortBy}-${sorting.sortDir}`,
    query,
    rows,
  };
}
