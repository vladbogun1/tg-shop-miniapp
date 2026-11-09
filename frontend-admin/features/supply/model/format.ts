import { formatMoment } from "@shop/core/time";

/** Число с одним знаком после запятой, десятичная запятая («12,3»): размер файла в МБ, маржа в %. Не деньги. */
export function decimal1(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }).format(n).replace(".", ",");
}

/** Маржа в процентах от цены: (цена − себестоимость) / цена × 100. Вызывающий сам проверяет, что цена > 0. */
export function marginPercent(priceMinor: number, costMinor: number): number {
  return 100 * ((priceMinor - costMinor) / priceMinor);
}

/**
 * Сколько обойдётся 1 шт, если приедет `qty` шт: закупка за штуку + расходы строки, поделённые на пришедшее.
 * Оценка для окна «Приехала» (точную считает сервер после прихода); null — нечего считать.
 */
export function arrivedUnitCost(purchaseUnitMinor: number | null, extraLineMinor: number, qty: number): number | null {
  if (purchaseUnitMinor == null || !(qty > 0)) return null;
  return purchaseUnitMinor + Math.round(extraLineMinor / qty);
}

/** «2026-11-05» → «05.11.2026»; другое — как есть. */
export function dayOf(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/**
 * Как поставку называют в списке и шапке: «№10 · Taobao · X-Raypad — коврики и глайды · 05.11.2026».
 * Номер и дата (когда поставку завели, по Киеву) берутся из самой поставки — в название их писать не нужно.
 * Дата уже есть в названии («Поставка от 05.11») — второй раз не пишем.
 */
export function batchName(b: { id: number; title: string; createdAt: string }): string {
  const day = formatMoment(b.createdAt, { day: "2-digit", month: "2-digit", year: "numeric" }, "ru-RU", "Europe/Kyiv");
  const dayInTitle = day !== "" && b.title.includes(day.slice(0, 5));
  return [`№${b.id}`, b.title, dayInTitle ? "" : day].filter(Boolean).join(" · ");
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Поставщик для подзаголовка поставки: `null`, если он уже есть в названии (ИИ-поставка называет её по продавцу). */
export function supplierInSubtitle(title: string, supplier: string | null | undefined): string | null {
  if (!supplier) return "без поставщика";
  return squash(title).includes(squash(supplier)) ? null : supplier;
}
