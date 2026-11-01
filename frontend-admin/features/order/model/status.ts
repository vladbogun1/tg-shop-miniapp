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

import { allowedTargets, canTransition, ORDER_STATUS_COLOR, STATUS_COLUMN_LABEL, STATUS_ORDER, isOrderStatus } from "@shop/core/orders";
import { type OrderStatus } from "@shop/core/types";

/** The field of the order card that holds the moment the order entered a status. */
type StatusTimestampKey = "createdAt" | "approvedAt" | "shippedAt" | "deliveredAt" | "rejectedAt";

interface StatusMeta {
  /** Step in the happy-path timeline (0 = first); null — a branch off it («Отклонён»). */
  step: number | null;
  /** A closed status: the period filter and «Показать ещё» apply to its column. */
  closed: boolean;
  /** Moving an order here opens a modal (extra input or an explicit confirmation). */
  needsModal: boolean;
  /** Field of the order card with the time of entering the status. */
  at: StatusTimestampKey;
}

/**
 * Everything the admin knows about an order status besides its label and colour (those come from
 * @shop/core/orders). `Record<OrderStatus, …>`: a new status in OpenAPI fails typecheck right here,
 * not as a forgotten `if` in the timeline or the inbox.
 */
export const STATUS_META: Record<OrderStatus, StatusMeta> = {
  NEW: { step: 0, closed: false, needsModal: false, at: "createdAt" },
  APPROVED: { step: 1, closed: false, needsModal: false, at: "approvedAt" },
  SHIPPED: { step: 2, closed: false, needsModal: true, at: "shippedAt" },
  DELIVERED: { step: 3, closed: true, needsModal: true, at: "deliveredAt" },
  REJECTED: { step: null, closed: true, needsModal: true, at: "rejectedAt" },
};

export { isOrderStatus };

/** Happy-path statuses in timeline order. */
export const TIMELINE_STATUSES: OrderStatus[] = STATUS_ORDER.filter((s) => STATUS_META[s].step !== null).sort(
  (a, b) => (STATUS_META[a].step ?? 0) - (STATUS_META[b].step ?? 0)
);

/** When the order entered `status`. */
export function statusTimestamp(order: Record<StatusTimestampKey, string | null | undefined>, status: OrderStatus): string | null | undefined {
  return order[STATUS_META[status].at];
}

/** Does moving an order to `target` open a modal? */
export function needsModal(target: OrderStatus): boolean {
  return STATUS_META[target].needsModal;
}

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

export { allowedTargets, canTransition };

/** Shown when a delivered order is dragged to «Отклонён». */
export const DELIVERED_REJECT_HINT =
  "Доставленный заказ не отклоняют — оформите «Возврат» в карточке заказа";

/** Closed columns: the period filter and the short "20 + ещё" list apply only to them. */
export const CLOSED_STATUSES: OrderStatus[] = STATUS_ORDER.filter((s) => STATUS_META[s].closed);
