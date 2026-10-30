/** Labels, filters and sorting of the Halloween participants table (page /halloween). */
import type { HwMember, InviteState } from "@/lib/halloween-api";

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

export const INVITE: Record<InviteState, { label: string; tone: Tone }> = {
  joined: { label: "участвует", tone: "ok" },
  grey: { label: "не нажал", tone: "neutral" },
  "not-sent": { label: "не разослано", tone: "neutral" },
  blocked: { label: "заблокировал", tone: "danger" },
  error: { label: "ошибка", tone: "warn" },
};

export type Filter = "all" | "pumpkins" | "orders" | "old" | "grey" | "blocked" | "excluded";

export const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "pumpkins", label: "Тыквы" },
  { value: "orders", label: "Покупки" },
  { value: "old", label: "Постоянные" },
  { value: "grey", label: "Не нажали" },
  { value: "blocked", label: "Заблокировали" },
  { value: "excluded", label: "Исключены" },
];

const MATCH: Record<Filter, (m: HwMember) => boolean> = {
  all: () => true,
  pumpkins: (m) => m.pumpkins > 0,
  orders: (m) => m.orderTickets > 0 || m.spendMinor > 0,
  old: (m) => m.old,
  grey: (m) => m.invite === "grey",
  blocked: (m) => m.broadcast === "blocked" || m.botBlocked,
  excluded: (m) => m.excluded !== null,
};

export type SortKey = "pumpkins" | "pumpkinTickets" | "spendMinor" | "orderTickets" | "lifetimeSpendMinor" | "lastPumpkinAt" | "name";
export type SortDir = "asc" | "desc";

export const MOBILE_SORTS: { value: string; label: string }[] = [
  { value: "pumpkins:desc", label: "Больше тыкв" },
  { value: "spendMinor:desc", label: "Больше потратили за акцию" },
  { value: "orderTickets:desc", label: "Больше билетов за покупки" },
  { value: "lifetimeSpendMinor:desc", label: "Больше потратили всего" },
  { value: "lastPumpkinAt:desc", label: "Недавно ловили тыквы" },
  { value: "name:asc", label: "Имя А–Я" },
];

export function displayName(m: HwMember): string {
  return m.name || (m.username ? "@" + m.username : "#" + m.tgId);
}

export function initials(m: HwMember): string {
  const parts = (m.name || m.username || "").trim().split(/\s+/);
  const s = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return s.toUpperCase() || m.tgId.slice(0, 2);
}

/** Search, filter and sort in the browser: the event has hundreds of people, not thousands of pages. */
export function view(rows: HwMember[], q: string, filter: Filter, sortBy: SortKey, dir: SortDir): HwMember[] {
  const needle = q.trim().toLowerCase().replace(/^@/, "");
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .filter(MATCH[filter])
    .filter((m) => !needle || `${m.name ?? ""} ${m.username ?? ""} ${m.tgId}`.toLowerCase().includes(needle))
    .sort((a, b) => {
      if (sortBy === "name") return sign * displayName(a).localeCompare(displayName(b), "ru");
      return sign * ((Number(a[sortBy]) || 0) - (Number(b[sortBy]) || 0)) || b.pumpkins - a.pumpkins;
    });
}

export function filterCount(rows: HwMember[], f: Filter): number {
  return rows.filter(MATCH[f]).length;
}

export const pct = (x: number) => (x <= 0 ? "—" : x < 0.001 ? "<0.1 %" : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)} %`);

/** CSV for Excel (BOM + semicolons), the same columns as the table. */
export function toCsv(rows: HwMember[]): string {
  const head = ["tg_id", "имя", "username", "тыквы", "дней", "билеты_тыквы", "шанс_тыквы_%", "заказы_акции", "сумма_акции_грн",
    "билеты_покупки", "шанс_покупки_%", "всего_заказов", "всего_грн", "постоянный", "приглашение", "рассылка", "бот_заблокирован", "исключён"];
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((m) =>
    [m.tgId, m.name, m.username, m.pumpkins, m.pumpkinDays, m.pumpkinTickets, (m.pumpkinChance * 100).toFixed(2), m.orders,
      Math.round(m.spendMinor / 100), m.orderTickets, (m.orderChance * 100).toFixed(2), m.lifetimeOrders, Math.round(m.lifetimeSpendMinor / 100),
      m.old ? "да" : "", m.invite ? INVITE[m.invite].label : "", m.broadcast ?? "", m.botBlocked ? "да" : "", m.excluded ?? ""]
      .map(q).join(";"));
  return "﻿" + [head.join(";"), ...lines].join("\n");
}
