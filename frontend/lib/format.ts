/** Date/time formatting + order-status display helpers (Russian UI). */
import type { OrderStatus } from "@/lib/api";

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Day label for chat separators: "Сегодня" / "Вчера" / date. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (startOf(now) - startOf(d)) / 86_400_000;
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
  });
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "Новый",
  APPROVED: "Одобрен",
  SHIPPED: "Отправлен",
  DELIVERED: "Доставлен",
  REJECTED: "Отклонён",
};

/** A CSS color token for each status. */
export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  NEW: "var(--accent)",
  APPROVED: "var(--ok)",
  SHIPPED: "var(--warn)",
  DELIVERED: "var(--ok)",
  REJECTED: "var(--danger)",
};

/** Ordered status timeline (REJECTED handled separately). */
export const ORDER_TIMELINE: OrderStatus[] = [
  "NEW",
  "APPROVED",
  "SHIPPED",
  "DELIVERED",
];

export function shortOrderId(id: string): string {
  return `#${id.slice(0, 8)}`;
}
