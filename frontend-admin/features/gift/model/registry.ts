/** Реестр подарков: границы месяца и CSV для бухгалтера (по-украински, под Excel: «;», запятая в суммах). */
import { formatMoment } from "@shop/core/time";
import { shortOrderId as shortId } from "@shop/core/format";
import type { GiftRegistry } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** First and last day of a month (m 0-based), YYYY-MM-DD. */
export function monthSpan(y: number, m: number): [string, string] {
  return [iso(y, m, 1), iso(y, m, new Date(y, m + 1, 0).getDate())];
}

/** Both dates look like YYYY-MM-DD and the period is not backwards. */
export function isValidSpan(from: string, to: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
}

const UK_SOURCE: Record<string, string> = {
  CASE: "Кейс (рекламна акція)",
  THRESHOLD: "Подарунок за суму замовлення",
  ADMIN: "Подарунок від магазину",
};

const UK_STATUS: Record<string, string> = {
  NEW: "Нове",
  APPROVED: "Прийняте",
  SHIPPED: "Відправлене",
  DELIVERED: "Доставлене",
};

const CSV_HEAD = [
  "Дата вручення",
  "Дата замовлення",
  "Замовлення",
  "Статус",
  "Отримувач (ПІБ)",
  "Телефон",
  "Telegram",
  "Особа",
  "Подарунок",
  "Варіант",
  "Кількість",
  "Ціна за од., грн",
  "Вартість, грн",
  "Джерело",
  "Місяць",
  "Подарунків особі за місяць, грн",
  "Ліміт на місяць, грн",
  "Перевищення ліміту, грн",
];

/** Kopecks → "1234,56" (no grouping: Excel reads it as a number in the Ukrainian locale). */
export const uah = (minor: number) => (minor / 100).toFixed(2).replace(".", ",");

/** dd.mm.yyyy in Kyiv. */
export const ukDate = (isoTs: string | null) =>
  isoTs ? formatMoment(isoTs, { day: "2-digit", month: "2-digit", year: "numeric" }, "uk-UA", "Europe/Kyiv") : "";

export function cell(v: string | number): string {
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The file's text: the header, a line per gift, a footer with the totals. Starts with a BOM — Excel opens UTF-8 with Cyrillic only with it. */
export function buildCsv(data: GiftRegistry): string {
  const limit = data.limitMinor;
  const rows = data.rows.map((r) => [
    ukDate(r.deliveredAt) || "не вручено",
    ukDate(r.createdAt),
    shortId(r.orderId),
    UK_STATUS[r.status] ?? r.status,
    r.customerName,
    r.phone,
    r.tgUsername ? `@${r.tgUsername}` : "",
    r.person,
    r.title,
    r.variant ?? "",
    r.quantity,
    uah(r.unitMinor),
    uah(r.valueMinor),
    UK_SOURCE[r.source] ?? r.source,
    r.month,
    uah(r.monthTotalMinor),
    limit > 0 ? uah(limit) : "",
    limit > 0 && r.monthTotalMinor > limit ? uah(r.monthTotalMinor - limit) : "",
  ]);
  const footer: (string | number)[][] = [
    [],
    ["Період", `${ukDate(data.from + "T12:00:00Z")} – ${ukDate(data.to + "T12:00:00Z")}`],
    ["Подарунків", data.count],
    ["На суму, грн", uah(data.totalMinor)],
    ["Осіб", data.people],
    ["Осіб з перевищенням ліміту", data.overLimit],
  ];
  const text = [CSV_HEAD, ...rows, ...footer].map((line) => line.map(cell).join(";")).join("\r\n");
  return "﻿" + text;
}

export const csvFileName = (data: GiftRegistry) => `podarunky_${data.from}_${data.to}.csv`;
