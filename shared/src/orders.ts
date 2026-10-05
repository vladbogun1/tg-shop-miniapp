/**
 * Order status vocabulary and transition rules, in one place.
 *
 * <p>The two apps kept separate copies and had already drifted: the admin's table disallowed
 * NEW → SHIPPED while the backend allowed it, and the admin rendered a "В новые" action for a
 * transition the server rejects outright.
 */
import type { OrderStatus } from "./types";

export const STATUS_ORDER: OrderStatus[] = [
  "NEW",
  "APPROVED",
  "SHIPPED",
  "DELIVERED",
  "REJECTED",
];

/** Labels as the customer sees them (singular, about their own order). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "Новый",
  APPROVED: "Одобрен",
  SHIPPED: "Отправлен",
  DELIVERED: "Доставлен",
  REJECTED: "Отклонён",
};

/**
 * Labels the admin uses everywhere — columns, badges, timeline, toasts. One word per status, all
 * singular, and the same word the customer sees ("Отправлен", not a mix of "Выслан"/"Отправка"/
 * "Новые"/"Одобрены" as before).
 */
export const STATUS_COLUMN_LABEL: Record<OrderStatus, string> = {
  NEW: "Новый",
  APPROVED: "Одобрен",
  SHIPPED: "Отправлен",
  DELIVERED: "Доставлен",
  REJECTED: "Отклонён",
};

/** Admin action verbs per target status (buttons, the "Переместить в…" sheet). */
export const STATUS_ACTION_LABEL: Record<OrderStatus, string> = {
  NEW: "В новые",
  APPROVED: "Одобрить",
  SHIPPED: "Отправить (ТТН)",
  DELIVERED: "Доставлен",
  REJECTED: "Отклонить",
};

/** Reasons for a rejection — the backend's RejectReasonCode. */
export type RejectReasonCode =
  | "NO_RESPONSE"
  | "CHANGED_MIND"
  | "OUT_OF_STOCK"
  | "DUPLICATE"
  | "NOT_PAID"
  /** Set automatically: not paid online within the deadline (24 h). Not offered in the picker. */
  | "PAYMENT_TIMEOUT"
  | "REFUSED_AT_POST"
  | "RETURNED"
  | "OTHER";

/** ADMIN ONLY (Russian): labels for the reject reason picker and the order card. */
export const REJECT_REASON_LABEL: Record<RejectReasonCode, string> = {
  NO_RESPONSE: "Не выходит на связь",
  CHANGED_MIND: "Передумал / отменил",
  OUT_OF_STOCK: "Нет в наличии",
  DUPLICATE: "Дубль заказа",
  NOT_PAID: "Не оплатил",
  PAYMENT_TIMEOUT: "Не оплатил за сутки",
  REFUSED_AT_POST: "Отказ на почте",
  RETURNED: "Возврат после получения",
  OTHER: "Другое",
};

/**
 * Nova Poshta express waybill: 14 digits starting with 20 or 59 (spaces allowed while typing).
 * A hint, not a hard rule — the admin may still save something else after a warning.
 */
export function isNovaPoshtaTtn(value: string): boolean {
  return /^(20|59)\d{12}$/.test(value.replace(/\s+/g, ""));
}

export const STATUS_EMOJI: Record<OrderStatus, string> = {
  NEW: "🆕",
  APPROVED: "✅",
  SHIPPED: "📦",
  DELIVERED: "🎉",
  REJECTED: "❌",
};

/** CSS custom property per status — the same identity in both apps' themes. */
export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  NEW: "var(--st-new)",
  APPROVED: "var(--st-approved)",
  SHIPPED: "var(--st-shipped)",
  DELIVERED: "var(--st-delivered)",
  REJECTED: "var(--st-rejected)",
};

/** The happy path, for the customer's timeline (REJECTED is handled separately). */
export const ORDER_TIMELINE: OrderStatus[] = ["NEW", "APPROVED", "SHIPPED", "DELIVERED"];

/**
 * Allowed transitions — mirrors OrderService on the backend.
 *
 * <p>NEW → SHIPPED is permitted (the server allows shipping straight away), REJECTED is terminal,
 * and DELIVERED can still be rejected to handle a Nova Poshta return. There is no way back to NEW.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["APPROVED", "SHIPPED", "REJECTED"],
  APPROVED: ["SHIPPED", "REJECTED"],
  SHIPPED: ["DELIVERED", "REJECTED"],
  DELIVERED: ["REJECTED"],
  REJECTED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

export function allowedTargets(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from];
}

/** Cash to collect on delivery: everything not yet confirmed as received. */
export function codMinor(order: { totalMinor: number; receivedMinor?: number }): number {
  return Math.max(0, order.totalMinor - Math.max(0, order.receivedMinor ?? 0));
}

/**
 * How an order's payment stands. AWAITING = placed, online payment still due before the deadline
 * (paymentDueAt); UNPAID = nothing received and nothing pending (old orders, cancelled ones).
 */
export type PaymentState = "PAID" | "PARTIAL" | "AWAITING" | "UNPAID";

export function paymentState(order: {
  paid: boolean;
  status?: OrderStatus;
  totalMinor?: number;
  receivedMinor?: number;
  amountDueMinor?: number;
  paymentDueAt?: string | null;
}): PaymentState {
  if (order.paid) {
    const total = order.totalMinor ?? 0;
    const received = order.receivedMinor;
    // Only claim "partial" when the amount is actually known and falls short (prepayment + COD).
    if (received !== undefined && total > 0 && received > 0 && received < total) {
      return "PARTIAL";
    }
    return "PAID";
  }
  if (
    order.paymentDueAt &&
    (order.amountDueMinor ?? 1) > 0 &&
    (order.status === undefined || order.status === "NEW" || order.status === "APPROVED")
  ) {
    return "AWAITING";
  }
  return "UNPAID";
}

/**
 * ADMIN ONLY. The customer app translates these from its own dictionary (`payment.*`) — a single
 * shared constant cannot be Russian for the seller and Ukrainian for the buyer at the same time.
 */
export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  PAID: "Оплачен",
  PARTIAL: "Частично оплачен",
  AWAITING: "Ждёт оплаты",
  UNPAID: "Не оплачен",
};
