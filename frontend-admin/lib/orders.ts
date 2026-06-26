/**
 * Order status metadata, transition rules, and formatting helpers.
 * Statuses: NEW, APPROVED, SHIPPED, DELIVERED, REJECTED (docs/SPEC.md).
 */
import type { OrderStatus, DeliveryMethod } from "./api";

export const STATUS_ORDER: OrderStatus[] = [
  "NEW",
  "APPROVED",
  "SHIPPED",
  "DELIVERED",
  "REJECTED",
];

export const STATUS_LABEL: Record<OrderStatus, string> = {
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

export const STATUS_VAR: Record<OrderStatus, string> = {
  NEW: "var(--st-new)",
  APPROVED: "var(--st-approved)",
  SHIPPED: "var(--st-shipped)",
  DELIVERED: "var(--st-delivered)",
  REJECTED: "var(--st-rejected)",
};

/**
 * Allowed status transitions. Cannot move back from DELIVERED, and REJECTED is
 * terminal. NEW/APPROVED/SHIPPED can also be rejected.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["APPROVED", "REJECTED"],
  APPROVED: ["SHIPPED", "REJECTED"],
  SHIPPED: ["DELIVERED", "REJECTED"],
  // Delivered can still be cancelled/returned (e.g. a Nova Poshta return).
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

export const DELIVERY_LABEL: Record<DeliveryMethod, string> = {
  NOVA_POSHTA: "Нова Пошта",
  PICKUP: "Самовывоз",
};

/** Short order id (#abcd1234) for cards. */
export function shortId(id: string): string {
  return "#" + id.replace(/-/g, "").slice(0, 8);
}

/** Relative-ish time label, ru. */
export function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
