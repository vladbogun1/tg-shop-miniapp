/**
 * Edit state of the settings form. Numbers are edited as text (so "" and "1." are representable
 * while typing) and parsed on save.
 */
import type { SettingItem, SettingValue } from "@/lib/settings";

export interface DraftEntry {
  /** string for INT/STRING/TEXT, boolean for BOOL. */
  raw: string | boolean;
  /** "Сбросить к значению по умолчанию" was pressed: send null, the stored row is removed. */
  reset: boolean;
}

export type Draft = Record<string, DraftEntry>;

export function toRaw(item: SettingItem, value: SettingValue): string | boolean {
  if (item.type === "BOOL") return Boolean(value);
  return value == null ? "" : String(value);
}

export function initialDraft(items: SettingItem[]): Draft {
  const d: Draft = {};
  for (const it of items) d[it.key] = { raw: toRaw(it, it.value), reset: false };
  return d;
}

/** Client-side check mirroring the server's validation; null = fine. */
export function validate(item: SettingItem, raw: string | boolean): string | null {
  if (item.type === "INT") {
    const s = String(raw).trim();
    if (!/^-?\d+$/.test(s)) return "Нужно целое число";
    const n = Number(s);
    if (item.min != null && n < item.min) return `Не меньше ${item.min}`;
    if (item.max != null && n > item.max) return `Не больше ${item.max}`;
    return null;
  }
  if (item.type === "STRING" || item.type === "TEXT") {
    const s = String(raw);
    if (item.type === "STRING" && /[\r\n]/.test(s)) return "Только одна строка";
    if (item.maxLength != null && s.trim().length > item.maxLength) return `Не длиннее ${item.maxLength} символов`;
  }
  return null;
}

/** Value to send for an edited (non-reset) entry. */
export function parse(item: SettingItem, raw: string | boolean): SettingValue {
  if (item.type === "BOOL") return Boolean(raw);
  if (item.type === "INT") return Number(String(raw).trim());
  return String(raw).trim();
}

/** Does this entry differ from what the server has? */
export function isDirty(item: SettingItem, entry: DraftEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.reset) return item.overridden;
  if (item.type === "BOOL") return entry.raw !== item.value;
  if (item.type === "INT") return String(entry.raw).trim() !== String(item.value);
  return String(entry.raw).trim() !== String(item.value ?? "");
}

/** Is the effective value (after save) the default one? */
export function isDefault(item: SettingItem, entry: DraftEntry | undefined): boolean {
  if (!entry) return !item.overridden;
  if (entry.reset) return true;
  if (item.type === "BOOL") return entry.raw === item.defaultValue;
  return String(entry.raw).trim() === String(item.defaultValue ?? "");
}

export function formatValue(item: SettingItem, value: SettingValue): string {
  if (item.type === "BOOL") return value ? "включено" : "выключено";
  if ((item.type === "TEXT" || item.type === "STRING") && String(value ?? "") === "") return "пусто";
  return item.unit ? `${value} ${item.unit}` : String(value);
}

export function formatDateTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
