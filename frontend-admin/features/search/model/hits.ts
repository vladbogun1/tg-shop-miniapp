/**
 * Результаты поиска палитры как строки для списка: заголовок, подпись и куда перейти по Enter.
 * Заказ → его страница; товар → список с открытым окном товара (`?edit=`); покупатель → список покупателей,
 * отфильтрованный по его Telegram-ID (`?q=`): профиля по прямой ссылке нет, а ID находит ровно одного человека.
 */
import type { Schemas } from "@shop/core/api/schemas";
import { money } from "@shop/core/money";
import { STATUS_COLUMN_LABEL } from "@shop/core/orders";

export type SearchResults = Schemas["SearchResults"];
type OrderHit = Schemas["OrderHit"];
type ProductHit = Schemas["ProductHit"];
type CustomerHit = Schemas["CustomerHit"];

/** Короче сервер не ищет (половина магазина подходит под одну букву). */
export const MIN_QUERY = 2;

export const normalizeQuery = (raw: string): string => raw.trim();

export interface HitRow {
  key: string;
  title: string;
  hint: string;
  href: string;
}

export interface HitGroup {
  title: string;
  rows: HitRow[];
}

const orderRow = (o: OrderHit): HitRow => ({
  key: `o:${o.id}`,
  title: `#${o.shortId} · ${o.customerName}`,
  hint: [o.phone, money(o.totalMinor), (STATUS_COLUMN_LABEL as Record<string, string>)[o.status] ?? o.status].join(" · "),
  href: `/orders/${o.id}`,
});

const productRow = (p: ProductHit): HitRow => ({
  key: `p:${p.id}`,
  title: p.title,
  hint: [p.sku, money(p.priceMinor, p.currency), `${p.stock} шт`, p.active ? null : "скрыт"].filter(Boolean).join(" · "),
  href: `/products?edit=${p.id}`,
});

const customerRow = (c: CustomerHit): HitRow => ({
  key: `c:${c.telegramUserId}`,
  title: c.name ?? (c.username ? `@${c.username}` : `ID ${c.telegramUserId}`),
  hint: [c.username && c.name ? `@${c.username}` : null, c.phone, `ID ${c.telegramUserId}`].filter(Boolean).join(" · "),
  href: `/users?q=${c.telegramUserId}`,
});

/** Непустые группы в порядке «заказы, товары, покупатели». */
export function hitGroups(r: SearchResults | undefined): HitGroup[] {
  if (!r) return [];
  const groups: HitGroup[] = [
    { title: "Заказы", rows: r.orders.map(orderRow) },
    { title: "Товары", rows: r.products.map(productRow) },
    { title: "Покупатели", rows: r.customers.map(customerRow) },
  ];
  return groups.filter((g) => g.rows.length > 0);
}
