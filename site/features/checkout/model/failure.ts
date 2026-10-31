import { type OrderLimitCode } from "@shop/core/orders";
import { classifyOrderFailure } from "@shop/customer/checkout/order-request";

type T = (key: "checkout.promoDropped" | "checkout.failed", params?: Record<string, string | number>) => string;

export interface FailureView {
  /** The server refused the promo code: drop it and ask for one more click. */
  dropPromo: boolean;
  message: string;
  /** An anti-bot limit (TOO_MANY_UNPAID → link to my orders). */
  limitCode: OrderLimitCode | null;
}

/** What the customer is told when creating the order failed. */
export function describeFailure(e: unknown, t: T): FailureView {
  const failure = classifyOrderFailure(e);
  if (failure.kind === "promoRejected") {
    return { dropPromo: true, message: t("checkout.promoDropped", { message: failure.message }), limitCode: null };
  }
  // Anti-bot limits: the server's message says what to do (pay/cancel, wait, fewer items).
  if (failure.kind === "limit") return { dropPromo: false, message: failure.message, limitCode: failure.code };
  return { dropPromo: false, message: failure.message ?? t("checkout.failed"), limitCode: null };
}

/** The section id to scroll to when the form cannot be submitted: contacts, then delivery, then payment. */
export function firstInvalidSection(v: { nameOk: boolean; phoneOk: boolean; deliveryOk: boolean }): string {
  if (!v.nameOk || !v.phoneOk) return "co-contacts";
  return v.deliveryOk ? "co-payment" : "co-delivery";
}
