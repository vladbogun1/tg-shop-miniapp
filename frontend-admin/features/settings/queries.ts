"use client";

import { QUERY_PRESETS } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi, type SettingValue } from "./api";
import { settingsKeys } from "./keys";

export function useSettingsQuery() {
  return useQuery({ queryKey: settingsKeys.all(), queryFn: settingsApi.list });
}

/**
 * Текущее значение одной настройки для других экранов, например `useShopSetting("catalog.lowStockQty", 3)`.
 * Пока грузится или API недоступно — `fallback`, чтобы вызывающий не блокировался.
 */
export function useShopSetting<T extends SettingValue>(key: string, fallback: T): T {
  const { data } = useQuery({
    queryKey: settingsKeys.all(),
    queryFn: settingsApi.list,
    staleTime: QUERY_PRESETS.static.staleTime,
  });
  const item = data?.items.find((i) => i.key === key);
  return item && typeof item.value === typeof fallback ? (item.value as T) : fallback;
}

/**
 * Поля настроек для поиска Ctrl+K: тот же кэш, что у экрана настроек, без запроса, пока ищут меньше `enabled`
 * символов, и без перезапроса на каждый символ (свежесть — как у `useShopSetting`).
 */
export function useSettingsSearchItems(enabled: boolean) {
  const { data } = useQuery({
    queryKey: settingsKeys.all(),
    queryFn: settingsApi.list,
    staleTime: QUERY_PRESETS.static.staleTime,
    enabled,
  });
  return data?.items;
}

export function useSystemQuery() {
  return useQuery({ queryKey: settingsKeys.system(), queryFn: settingsApi.system });
}


/** Сохранение изменённых настроек одним запросом; ответ сервера заменяет кэш. */
export function useSaveSettings() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (values: Record<string, SettingValue | null>) => settingsApi.save(values),
    // Пороги «Внимания» могли измениться.
    invalidate: [settingsKeys.inbox(), settingsKeys.system()],
    success: (_r, values) => {
      const n = Object.keys(values).length;
      return n === 1 ? "Настройка сохранена" : `Сохранено настроек: ${n}`;
    },
    errorFallback: "Не удалось сохранить",
    onSuccess: (fresh) => {
      qc.setQueryData(settingsKeys.all(), fresh);
    },
  });
}
