/**
 * Order status metadata and transition rules.
 *
 * The rules themselves live in @shop/shared so the admin and the Mini App cannot disagree with
 * each other — or with the backend, which is what happened before (the admin refused NEW → SHIPPED
 * that the server accepts, and offered a "В новые" action the server always rejects).
 */
export { codMinor, isNovaPoshtaTtn, ORDER_STATUS_COLOR as STATUS_VAR, REJECT_REASON_LABEL, STATUS_ACTION_LABEL, STATUS_COLUMN_LABEL as STATUS_LABEL, STATUS_ORDER, type RejectReasonCode } from "@shop/core/orders";
export { DELIVERY_LABEL } from "@/lib/delivery";
export { shortOrderId as shortId } from "@shop/core/format";

import { allowedTargets as sharedAllowedTargets, canTransition as sharedCanTransition, ORDER_STATUS_COLOR, STATUS_COLUMN_LABEL } from "@shop/core/orders";
import { type OrderStatus } from "@shop/core/types";

/**
 * «Едет назад» (V68) — a board column, not a status: a refused parcel (REJECTED) or the returned
 * part of a delivered order travelling back, until «Посылка вернулась» puts it on the shelf or
 * writes it off. The order is never split: a partial return also stays in «Доставлен».
 */
export const RETURNING = "RETURNING" as const;
export type BoardKey = OrderStatus | typeof RETURNING;
export const BOARD_ORDER: BoardKey[] = ["NEW", "APPROVED", "SHIPPED", "DELIVERED", RETURNING, "REJECTED"];
export const BOARD_LABEL: Record<BoardKey, string> = { ...STATUS_COLUMN_LABEL, RETURNING: "Едет назад" };
export const BOARD_VAR: Record<BoardKey, string> = { ...ORDER_STATUS_COLOR, RETURNING: "var(--st-returning)" };

/** What is travelling back on an order right now: the units on the way × the price paid for them. */
export function returningMinor(order: { lines?: { returningMinor?: number }[] }): number {
  return (order.lines ?? []).reduce((acc, l) => acc + (l.returningMinor ?? 0), 0);
}

/**
 * Admin transitions: the shared table still lists DELIVERED → REJECTED, but the server refuses it
 * since 25.10.2026 (ORDER_DELIVERED_REJECT) — a delivered order is handled with «Возврат».
 */
export function allowedTargets(from: OrderStatus): OrderStatus[] {
  return sharedAllowedTargets(from).filter((t) => !(from === "DELIVERED" && t === "REJECTED"));
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === "DELIVERED" && to === "REJECTED") return false;
  return sharedCanTransition(from, to);
}

/** Shown when a delivered order is dragged to «Отклонён». */
export const DELIVERED_REJECT_HINT =
  "Доставленный заказ не отклоняют — оформите «Возврат» в карточке заказа";

/** Closed columns: the period filter and the short "20 + ещё" list apply only to them. */
export const CLOSED_STATUSES: OrderStatus[] = ["DELIVERED", "REJECTED"];
