import type { Schemas } from "@shop/core/api/schemas";
import { apiGet, apiPut } from "@/lib/api";

export type SettingType = "INT" | "BOOL" | "STRING" | "TEXT" | "SELECT";
export type SettingValue = number | boolean | string;
export type SettingOption = Schemas["SettingsSettingDefinitionOption"];

/** В OpenAPI тип и значения — `string`/`unknown`; здесь сужены до того, что отдаёт бэкенд (SettingType, SettingValue). */
export type SettingItem = Omit<Schemas["SettingItemDto"], "type" | "value" | "defaultValue"> & {
  type: SettingType;
  value: SettingValue;
  defaultValue: SettingValue;
};
export type SettingsGroup = Schemas["SettingsGroupDto"];
export type SettingsResponse = { groups: SettingsGroup[]; items: SettingItem[] };
export type SystemInfo = Schemas["SystemInfoDto"];

export const settingsApi = {
  list: () => apiGet<Schemas["SettingsResponse"]>("/api/admin/settings").then((r) => r as SettingsResponse),
  /** `null` — сбросить ключ к значению по умолчанию. Всё или ничего на сервере. */
  save: (values: Record<string, SettingValue | null>) =>
    apiPut<Schemas["SettingsResponse"]>("/api/admin/settings", { values }).then((r) => r as SettingsResponse),
  system: () => apiGet<SystemInfo>("/api/admin/settings/system"),
};
