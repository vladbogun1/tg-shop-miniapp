/**
 * Расчёты обмена (POST /orders/{id}/exchange): сколько осталось на складе под замену, сколько покупатель
 * заплатил за возвращаемое (зачёт), доплата или остаток к возврату. Сервер пересчитывает всё сам — это подсказка.
 */
import type { Product, ProductVariant } from "@shop/core/types";
import type { ExchangeBody, ExchangeOutcome } from "../api";
import type { ReturnOrder } from "./types";

export interface BackLine {
  qty: number;
  outcome: ExchangeOutcome;
}

export interface NewLine {
  key: string;
  product: Product;
  variant: ProductVariant | null;
  qty: number;
}

/** Сколько единиц позиции осталось в заказе (ещё можно вернуть). */
export function exchangeLeft(it: ReturnOrder["items"][number]): number {
  return it.quantity - (it.returnedQty ?? 0);
}

/** По почте единица едет назад сама; при самовывозе обычно уже у нас. */
export function defaultExchangeOutcome(order: ReturnOrder): ExchangeOutcome {
  return order.deliveryMethod === "NOVA_POSHTA" ? "IN_TRANSIT" : "RESTOCK";
}

const sameLine = (l: NewLine, productId: string, variantId: string | null) =>
  l.product.id === productId && (l.variant?.id ?? null) === variantId;

/** Единиц, уже взятых строками списка, — вычитается из остатка под ещё один выбор. */
export function takenBy(lines: NewLine[], productId: string, variantId?: string | null): number {
  return lines.filter((l) => sameLine(l, productId, variantId ?? null)).reduce((s, l) => s + l.qty, 0);
}

export function stockOf(lines: NewLine[], p: Product, v: ProductVariant | null): number {
  const total = v
    ? (v.stock ?? 0)
    : p.variants?.length
      ? p.variants.reduce((s, x) => s + (x.stock ?? 0), 0)
      : (p.stock ?? 0);
  return total - takenBy(lines, p.id, v?.id);
}

/** Замена — обычный заказ: скрытые из магазина товары в него не попадают. */
export function filterProducts(products: Product[], query: string): Product[] {
  const s = query.trim().toLowerCase();
  return products
    .filter((p) => !p.archived && p.active !== false)
    .filter((p) => (s ? p.title.toLowerCase().includes(s) : true))
    .slice(0, 40);
}

/** Добавить единицу к строке замены или завести новую. */
export function addToLines(lines: NewLine[], p: Product, v: ProductVariant | null): NewLine[] {
  const i = lines.findIndex((l) => sameLine(l, p.id, v?.id ?? null));
  if (i >= 0) return lines.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
  return [...lines, { key: `${p.id}:${v?.id ?? ""}`, product: p, variant: v, qty: 1 }];
}

/** За что покупатель заплатил по возвращаемым единицам (с учётом скидки заказа) — зачёт сервера. */
export function backValueOf(order: ReturnOrder, back: Record<number, BackLine>): number {
  return order.items.reduce((sum, it) => {
    const l = it.id != null ? back[it.id] : undefined;
    return sum + (l ? l.qty * (it.gift ? 0 : (it.unitPaidMinor ?? it.priceMinor)) : 0);
  }, 0);
}

export function newValueOf(lines: NewLine[]): number {
  return lines.reduce((s, l) => s + l.product.priceMinor * l.qty, 0);
}

export interface ExchangeMoney {
  credit: number;
  /** Доплата за более дорогую замену. */
  due: number;
  /** Что останется вернуть при более дешёвой. */
  over: number;
}

/** Зачёт ограничен тем, что оплачено и ещё не возвращено. */
export function exchangeMoney(order: ReturnOrder, backValue: number, newValue: number): ExchangeMoney {
  const kept = Math.max(0, (order.receivedMinor ?? 0) - (order.refundedMinor ?? 0));
  const credit = Math.min(backValue, kept, newValue);
  return {
    credit,
    due: newValue - credit,
    over: Math.min(backValue, kept) - credit,
  };
}

export function buildExchangeBody(
  back: Record<number, BackLine>,
  lines: NewLine[],
  target: ExchangeBody["targetStatus"],
  notify: boolean,
  note: string,
): ExchangeBody {
  return {
    returned: Object.entries(back)
      .filter(([, l]) => l.qty > 0)
      .map(([id, l]) => ({
        itemId: Number(id),
        quantity: l.qty,
        outcome: l.outcome,
      })),
    items: lines.map((l) => ({
      productId: l.product.id,
      variantId: l.variant?.id ?? undefined,
      quantity: l.qty,
    })),
    targetStatus: target,
    notifyCustomer: notify,
    note: note.trim() || undefined,
  };
}
