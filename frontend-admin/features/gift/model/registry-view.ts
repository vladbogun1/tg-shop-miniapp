/** Реестр подарков на экране: фильтр по источнику / «сверх лимита», группировка «По людям», итог по строкам. Только показ — CSV берёт все строки. */
import type { GiftRegistryRow, GiftSource } from "./types";

export type RegistryFilter = "all" | "over" | GiftSource;

export const REGISTRY_FILTERS: { value: RegistryFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "over", label: "Сверх лимита" },
  { value: "CASE", label: "Кейс" },
  { value: "THRESHOLD", label: "За сумму" },
  { value: "ADMIN", label: "Ручные" },
];

export function filterRows(rows: GiftRegistryRow[], f: RegistryFilter): GiftRegistryRow[] {
  if (f === "all") return rows;
  if (f === "over") return rows.filter((r) => r.overLimit);
  return rows.filter((r) => r.source === f);
}

export function totalOf(rows: GiftRegistryRow[]): { count: number; valueMinor: number } {
  return { count: rows.length, valueMinor: rows.reduce((a, r) => a + r.valueMinor, 0) };
}

export interface PersonGroup {
  key: string;
  name: string;
  phone: string;
  tgUsername: string | null;
  month: string;
  monthTotalMinor: number;
  overLimit: boolean;
  rows: GiftRegistryRow[];
}

/** Один человек в одном месяце = одна группа (лимит считается помесячно); сначала «сверх лимита», потом по сумме. */
export function groupByPerson(rows: GiftRegistryRow[]): PersonGroup[] {
  const m = new Map<string, PersonGroup>();
  for (const r of rows) {
    const key = `${r.phone}|${r.customerName}|${r.month}`;
    const g = m.get(key);
    if (g) {
      g.rows.push(r);
      g.overLimit ||= r.overLimit;
    } else {
      m.set(key, {
        key,
        name: r.customerName,
        phone: r.phone,
        tgUsername: r.tgUsername ?? null,
        month: r.month,
        monthTotalMinor: r.monthTotalMinor,
        overLimit: r.overLimit,
        rows: [r],
      });
    }
  }
  return [...m.values()].sort((a, b) => Number(b.overLimit) - Number(a.overLimit) || b.monthTotalMinor - a.monthTotalMinor);
}

/** Заполнение полосы лимита, целые %, 0…100; лимит выключен (0) — 0. */
export function limitFill(totalMinor: number, limitMinor: number): number {
  const PERCENT = 100;
  return limitMinor > 0 ? Math.min(PERCENT, Math.round((totalMinor / limitMinor) * PERCENT)) : 0;
}
