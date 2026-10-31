"use client";

import { useEffect, useMemo, useState } from "react";
import { useUsersTable } from "../../queries";
import { hasNextPage, toggleSorting, type Sorting } from "../../model/table";
import type { UserSortBy } from "../../model/types";

/** Состояние таблицы: поиск (с задержкой 300 мс), фильтр, страница, сортировка; сброс страницы при смене условий. */
export function useUsersTableState() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [sorting, setSorting] = useState<Sorting>({ sortBy: "createdAt", sortDir: "desc" });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setPage(0);
  }, [debounced, blockedOnly, sorting.sortBy, sorting.sortDir]);

  const query = useUsersTable({ q: debounced, blockedOnly, page, sortBy: sorting.sortBy, sortDir: sorting.sortDir });
  const rows = useMemo(() => query.data ?? [], [query.data]);

  return {
    search,
    setSearch,
    blockedOnly,
    toggleBlockedOnly: () => setBlockedOnly((b) => !b),
    page,
    setPage,
    sorting,
    setSorting,
    toggleSort: (col: UserSortBy) => setSorting((s) => toggleSorting(s, col)),
    /** Меняется при любой смене условий — перезапускает анимацию списка. */
    resetKey: `${debounced}-${blockedOnly}-${page}-${sorting.sortBy}-${sorting.sortDir}`,
    query,
    rows,
    hasNext: hasNextPage(rows.length),
  };
}
