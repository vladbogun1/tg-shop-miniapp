/**
 * Быстрая правка цены и остатка прямо в списке — без мастера. Уходит отдельный `PATCH /products/{id}/quick`:
 * только изменённое поле плюс то, что админ видел (`expectedPriceMinor`, `expectedStock`) — сервер отвечает
 * 409 PRICE_CONFLICT / STOCK_CONFLICT, если правка из окна товара, заказ или поставка сдвинули значение за это время.
 */
import type { Schemas } from "@shop/core/api/schemas";
import { toMinor } from "@/lib/money";
import { effStock } from "./stock";
import type { AdminProduct } from "./types";

export type QuickBody = Schemas["ProductQuickEditRequest"];

/** Остаток: целое ≥ 0 (пробелы по краям не мешают); иначе null. */
export function parseStock(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  return Number(t);
}

/** Цена в гривнах («1 250,50», «1250.5») → копейки > 0; иначе null. */
export function parsePriceMinor(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "");
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return null;
  const minor = toMinor(t);
  return minor > 0 ? minor : null;
}

/** У товара с вариантами остаток — сумма вариантов: в списке он только читается, правка — в окне товара. */
export const hasVariantStock = (p: AdminProduct): boolean => (p.variants?.length ?? 0) > 0;

export interface QuickPriceEdit {
  kind: "price";
  priceMinor: number;
}
export interface QuickStockEdit {
  kind: "stock";
  stock: number;
}
export type QuickEdit = QuickPriceEdit | QuickStockEdit;

export type QuickPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      /** Без изменений: сохранять нечего. */
      noop: boolean;
      /** Сколько штук снимается с полки (0 — ничего): нужна причина списания. */
      drop: number;
      /** Строки, у которых остаток поднят: после сохранения можно предложить раздать брони. */
      raised: (string | null)[];
      body: (reason: { reason: string; note?: string } | null) => QuickBody;
    };

/** Проверка правки и сборка тела запроса. */
export function planQuickEdit(p: AdminProduct, edit: QuickEdit): QuickPlan {
  if (edit.kind === "price") {
    const compareAt = p.compareAtMinor ?? 0;
    if (compareAt > 0 && compareAt <= edit.priceMinor) return { ok: false, error: "Цена должна быть меньше «старой цены» — поправьте её в товаре" };
    return {
      ok: true,
      noop: edit.priceMinor === p.priceMinor,
      drop: 0,
      raised: [],
      body: () => ({ priceMinor: edit.priceMinor, expectedPriceMinor: p.priceMinor }),
    };
  }
  if (hasVariantStock(p)) return { ok: false, error: "Остаток считается по вариантам — откройте товар" };
  const was = effStock(p);
  return {
    ok: true,
    noop: edit.stock === was,
    drop: Math.max(0, was - edit.stock),
    raised: edit.stock > was ? [null] : [],
    body: (reason) => ({
      stock: edit.stock,
      expectedStock: was,
      ...(reason ? { stockReason: reason.reason, ...(reason.note ? { stockNote: reason.note } : {}) } : {}),
    }),
  };
}

/** Тот же товар с уже подставленной правкой — для мгновенного показа в списке до ответа сервера. */
export function withQuickEdit(p: AdminProduct, edit: QuickEdit): AdminProduct {
  return edit.kind === "price" ? { ...p, priceMinor: edit.priceMinor } : { ...p, stock: edit.stock };
}
