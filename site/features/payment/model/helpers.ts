import { type OnlinePayment, type OrderDetail } from "@shop/core/types";
import type { TFunction } from "@/i18n";

/** The order page right after the checkout: the "order created — pay or cancel" step. */
export function orderCreatedHref(orderPage: string): string {
  return `${orderPage}?created=1`;
}

/** Set automatically by the server when the order was not paid in time (not in the shared type yet). */
export function isPaymentTimeout(order: OrderDetail): boolean {
  return (order as OrderDetail & { rejectReasonCode?: string | null }).rejectReasonCode === "PAYMENT_TIMEOUT";
}

/** "Картка •• 1902", "Apple Pay •• 1902", "monobank" — how the money arrived. */
export function paymentMethodLabel(p: OnlinePayment, t: TFunction): string | null {
  const last4 = p.maskedPan?.replace(/\D/g, "").slice(-4) || null;
  const name =
    p.paymentMethod === "apple"
      ? "Apple Pay"
      : p.paymentMethod === "google"
        ? "Google Pay"
        : p.paymentMethod === "monobank"
          ? "monobank"
          : p.paymentMethod === "wallet"
            ? t("pay.method.wallet")
            : p.paymentMethod || last4
              ? t("pay.method.card")
              : null;
  if (!name) return null;
  return last4 && p.paymentMethod !== "monobank" ? `${name} •• ${last4}` : name;
}

/** `h:mm:ss` left until the payment deadline. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Invoice states after which there is nothing more to wait for. */
export const FINAL_PAYMENT_STATUSES = new Set(["success", "failure", "expired", "reversed"]);
/** Back from monobank but the invoice is still just "created": the customer left without paying. */
export const GIVE_UP_UNPAID_MS = 15_000;
