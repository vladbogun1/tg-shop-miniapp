/**
 * Shop settings (Настройки) — admin API client and a read hook for other screens.
 *
 * Kept out of lib/api.ts on purpose (that file is being reworked in parallel); it only uses the
 * shared HTTP helpers from there.
 */
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "@/lib/api";

export type SettingType = "INT" | "BOOL" | "STRING" | "TEXT";
export type SettingValue = number | boolean | string;

export interface SettingItem {
  key: string;
  group: string;
  type: SettingType;
  label: string;
  description: string;
  defaultValue: SettingValue;
  value: SettingValue;
  /** true = a stored value is in effect; false = the default applies. */
  overridden: boolean;
  min?: number | null;
  max?: number | null;
  maxLength?: number | null;
  unit?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface SettingsGroup {
  id: string;
  title: string;
  description: string;
}

export interface SettingsResponse {
  groups: SettingsGroup[];
  items: SettingItem[];
}

export interface SystemInfo {
  version?: string | null;
  buildTime?: string | null;
  timezone?: string | null;
  npLastSyncAt?: string | null;
  npLastSyncSummary?: string | null;
  npLastErrorAt?: string | null;
  npLastError?: string | null;
  npWarehouses?: number | null;
  npAutoSync: boolean;
}

/**
 * Status of the last site revalidation (`GET /api/admin/site/revalidate/status`, package A).
 * Field names are read tolerantly until that endpoint is merged.
 */
export interface RevalidateStatus {
  configured?: boolean;
  lastAt?: string | null;
  lastRunAt?: string | null;
  ok?: boolean | null;
  success?: boolean | null;
  error?: string | null;
  message?: string | null;
  paths?: number | string[] | null;
}

export const settingsApi = {
  list: () => apiGet<SettingsResponse>("/api/admin/settings"),
  /** `null` resets the key to its default. All-or-nothing on the server. */
  save: (values: Record<string, SettingValue | null>) =>
    apiPut<SettingsResponse>("/api/admin/settings", { values }),
  system: () => apiGet<SystemInfo>("/api/admin/settings/system"),
  revalidateSite: () => apiPost<unknown>("/api/admin/site/revalidate", {}),
  revalidateStatus: () => apiGet<RevalidateStatus>("/api/admin/site/revalidate/status"),
};

export const SETTINGS_QUERY_KEY = ["shop-settings"] as const;

/**
 * Current value of one setting for other admin screens, e.g.
 * `useShopSetting("catalog.lowStockQty", 3)`. Falls back to `fallback` while loading or if the
 * settings API is unreachable, so callers never block on it.
 */
export function useShopSetting<T extends SettingValue>(key: string, fallback: T): T {
  const { data } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: settingsApi.list,
    staleTime: 5 * 60_000,
  });
  const item = data?.items.find((i) => i.key === key);
  return item && typeof item.value === typeof fallback ? (item.value as T) : fallback;
}
