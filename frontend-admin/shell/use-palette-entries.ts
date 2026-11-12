"use client";

import { Box, ShoppingBag, SlidersHorizontal, UserRound } from "lucide-react";
import { useMemo } from "react";
import { hitGroups, MIN_QUERY, normalizeQuery, useAdminSearch, type HitGroup } from "@/features/search";
import { settingHits, useSettingsSearchItems, type SettingItem } from "@/features/settings";
import { useDebounced } from "@/lib/use-debounced";
import { filterPalette, paletteItems, type PaletteEntry } from "./palette-items";

const GROUP_ICON: Record<string, PaletteEntry["icon"]> = { Заказы: ShoppingBag, Товары: Box, Покупатели: UserRound };

/** Сколько полей настроек показывать в палитре: дальше — уточнить запрос или искать на /settings. */
const SETTINGS_LIMIT = 6;

/** Результаты поиска как строки палитры, в порядке показа: «Заказы», «Товары», «Покупатели». */
export function searchEntries(groups: HitGroup[]): PaletteEntry[] {
  return groups.flatMap((g) => g.rows.map((r) => ({ key: r.key, href: r.href, label: r.title, hint: r.hint, group: g.title, found: true, icon: GROUP_ICON[g.title] ?? Box })));
}

/** Поля настроек, совпавшие по подписи, — группа «Настройки» со ссылкой прямо на поле (подпись строки — раздел). */
export function settingEntries(items: readonly SettingItem[] | undefined, query: string): PaletteEntry[] {
  if (!items || normalizeQuery(query).length < MIN_QUERY) return [];
  return settingHits(items, query, "label")
    .slice(0, SETTINGS_LIMIT)
    .map((h) => ({ key: "setting:" + h.key, href: h.href, label: h.label, hint: h.section, group: "Настройки", found: true, icon: SlidersHorizontal }));
}

/**
 * Что показывает палитра: разделы по подстроке сразу, при запросе от двух символов — поля настроек (из кэша настроек,
 * без запроса на каждый символ), а с задержкой — ещё заказы, товары и покупатели с сервера. Порядок строк = порядок курсора и Enter.
 */
export function usePaletteEntries(query: string, superAdmin: boolean | undefined) {
  const normalized = normalizeQuery(query);
  const debounced = useDebounced(normalized, 250);
  const search = useAdminSearch(debounced);
  const settingItems = useSettingsSearchItems(normalized.length >= MIN_QUERY);
  const sections = useMemo(() => filterPalette(paletteItems(superAdmin), query), [superAdmin, query]);
  const settings = useMemo(() => settingEntries(settingItems, query), [settingItems, query]);
  const found = useMemo(() => searchEntries(hitGroups(search.data)), [search.data]);
  const asked = debounced.length >= MIN_QUERY;
  return {
    entries: useMemo(() => [...sections, ...settings, ...(asked ? found : [])], [sections, settings, found, asked]),
    /** Ответ ещё идёт (или запрос ещё не ушёл из-за задержки). */
    pending: normalized.length >= MIN_QUERY && (debounced !== normalized || search.isFetching),
    failed: asked && search.isError,
  };
}
