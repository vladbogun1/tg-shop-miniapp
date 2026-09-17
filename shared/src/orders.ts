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

/** Labels as the admin board's columns (plural). */
export const STATUS_COLUMN_LABEL: Record<OrderStatus, string> = {
  NEW: "Новые",
  APPROVED: "Одобрены",
  SHIPPED: "Выслан",
  DELIVERED: "Доставлен",
  REJECTED: "Отклонён",
};

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

/** How an order's payment stands — a claim is not a confirmation. */
export type PaymentState = "PAID" | "PARTIAL" | "CLAIMED" | "UNPAID";

export function paymentState(order: {
  paid: boolean;
  paymentClaimed?: boolean;
  totalMinor?: number;
  receivedMinor?: number;
}): PaymentState {
  // `paid` is the admin's confirmation and always wins: a confirmed order is never "на проверке",
  // whatever the claim flag says (every historical order carries claimed=true from the V12
  // backfill). Treating an absent receivedMinor as 0 previously made every paid order look
  // unconfirmed on the board, where the card payload does not carry the amount.
  if (order.paid) {
    const total = order.totalMinor ?? 0;
    const received = order.receivedMinor;
    // Only claim "partial" when the amount is actually known and falls short.
    if (received !== undefined && total > 0 && received > 0 && received < total) {
      return "PARTIAL";
    }
    return "PAID";
  }
  if (order.paymentClaimed) return "CLAIMED";
  return "UNPAID";
}

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  PAID: "Оплачен",
  PARTIAL: "Частично оплачен",
  CLAIMED: "Оплата на проверке",
  UNPAID: "Не оплачен",
};
