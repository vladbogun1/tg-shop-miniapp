"use client";

import { Box, ShoppingBag, UserRound } from "lucide-react";
import { useMemo } from "react";
import { hitGroups, MIN_QUERY, normalizeQuery, useAdminSearch, type HitGroup } from "@/features/search";
import { useDebounced } from "@/lib/use-debounced";
import { filterPalette, paletteItems, type PaletteEntry } from "./palette-items";

const GROUP_ICON: Record<string, PaletteEntry["icon"]> = { Заказы: ShoppingBag, Товары: Box, Покупатели: UserRound };

/** Результаты поиска как строки палитры, в порядке показа: «Заказы», «Товары», «Покупатели». */
export function searchEntries(groups: HitGroup[]): PaletteEntry[] {
  return groups.flatMap((g) => g.rows.map((r) => ({ key: r.key, href: r.href, label: r.title, hint: r.hint, group: g.title, found: true, icon: GROUP_ICON[g.title] ?? Box })));
}

/**
 * Что показывает палитра: разделы по подстроке сразу, а при запросе от двух символов (с задержкой) — ещё заказы,
 * товары и покупатели с сервера. Порядок строк = порядок курсора и Enter.
 */
export function usePaletteEntries(query: string, superAdmin: boolean | undefined) {
  const debounced = useDebounced(normalizeQuery(query), 250);
  const search = useAdminSearch(debounced);
  const sections = useMemo(() => filterPalette(paletteItems(superAdmin), query), [superAdmin, query]);
  const found = useMemo(() => searchEntries(hitGroups(search.data)), [search.data]);
  const asked = debounced.length >= MIN_QUERY;
  return {
    entries: useMemo(() => [...sections, ...(asked ? found : [])], [sections, found, asked]),
    /** Ответ ещё идёт (или запрос ещё не ушёл из-за задержки). */
    pending: normalizeQuery(query).length >= MIN_QUERY && (debounced !== normalizeQuery(query) || search.isFetching),
    failed: asked && search.isError,
  };
}
