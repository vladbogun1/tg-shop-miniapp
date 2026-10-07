/**
 * Online payment (monobank acquiring) vocabulary for the admin: invoice status labels and tones,
 * payment method names, the "pay within 24 h" countdown. Russian, admin only.
 */
import type { AdminInvoice, OnlinePaymentStatus } from "@shop/shared";

export type InvoiceTone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

export const INVOICE_STATUS_LABEL: Record<OnlinePaymentStatus, string> = {
  none: "Не открывал оплату",
  created: "Ссылка выдана",
  processing: "Обрабатывается",
  hold: "Холд",
  success: "Оплачен",
  failure: "Ошибка оплаты",
  reversed: "Возвращён",
  expired: "Истёк",
};

export const INVOICE_STATUS_TONE: Record<OnlinePaymentStatus, InvoiceTone> = {
  none: "neutral",
  created: "neutral",
  processing: "info",
  hold: "warn",
  success: "ok",
  failure: "danger",
  reversed: "warn",
  expired: "neutral",
};

/** Status label with a fallback for a value the backend adds later. */
export function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABEL[status as OnlinePaymentStatus] ?? status;
}

export function invoiceStatusTone(status: string): InvoiceTone {
  return INVOICE_STATUS_TONE[status as OnlinePaymentStatus] ?? "neutral";
}

const METHOD_LABEL: Record<string, string> = {
  pan: "карта",
  apple: "Apple Pay",
  google: "Google Pay",
  monobank: "monobank",
  wallet: "кошелёк",
  direct: "карта",
};

/** monobank `paymentInfo.paymentMethod` → what the admin reads; unknown values pass through. */
export function paymentMethodLabel(method?: string | null): string | null {
  if (!method) return null;
  return METHOD_LABEL[method.toLowerCase()] ?? method;
}

/** "444403******1902" → "•••• 1902". */
export function maskedPanShort(pan?: string | null): string | null {
  if (!pan) return null;
  const digits = pan.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : pan;
}

/** Amount still refundable on a paid invoice (what monobank holds minus refunds booked). */
export function refundableMinor(inv: AdminInvoice): number {
  if (inv.status !== "success") return 0;
  const base = inv.finalAmountMinor ?? inv.amountMinor;
  // finalAmount already excludes refunds once monobank reports them; refundedMinor covers the
  // window before that. Take the stricter of the two.
  const left = Math.min(base, inv.amountMinor - Math.max(0, inv.refundedMinor));
  return Math.max(0, left);
}

/** "5 ч 20 мин", "40 мин", "1 дн 3 ч" until `iso`; null when it has passed. */
export function timeLeft(iso: string, now = Date.now()): string | null {
  const ms = new Date(iso).getTime() - now;
  if (isNaN(ms) || ms <= 0) return null;
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    const m = min % 60;
    return m > 0 && h < 6 ? `${h} ч ${m} мин` : `${h} ч`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d} дн ${rh} ч` : `${d} дн`;
}

/** The deadline has passed. */
export function isOverdue(iso?: string | null, now = Date.now()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t) && t <= now;
}
