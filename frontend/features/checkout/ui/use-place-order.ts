"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type OrderLimitCode } from "@shop/core/orders";
import { buildCreateOrderRequest, classifyOrderFailure } from "@shop/customer/checkout/order-request";
import { useCreateOrder } from "@shop/customer/checkout/use-create-order";
import { markGiftCaseAutoOpen } from "@shop/ui/gift-case";
import type { GiftTierInfo } from "@shop/core/giftcase";
import { trackOrderCreated } from "@/lib/analytics";
import { useI18n } from "@/i18n/context";
import { customerApi, type DeliveryMethod, type NpWarehouse, type PaymentOption } from "@/lib/api";
import { cartAfterOrder, flushCart } from "@/lib/cart-sync";
import { haptic } from "@/lib/telegram";
import { useInvalidateMe } from "../queries";

type OrderLines = (Parameters<typeof buildCreateOrderRequest>[0]["lines"][number] & { key: string })[];

export interface PlaceOrderInput {
  lines: OrderLines;
  name: string;
  phone: string;
  comment: string;
  promoCode: string;
  /** ONLY a code the server has just confirmed is sent. */
  promoValid: boolean;
  setPromoCode: (code: string) => void;
  delivery: DeliveryMethod;
  warehouse: NpWarehouse | null;
  payment: PaymentOption | null;
  giftTier: GiftTierInfo | null;
  giftDiscount: number;
}

/**
 * Submit: POST /api/orders (one idempotency key per attempt, see useCreateOrder), then on to the
 * order page. A quantity change still in its debounce must reach the server cart BEFORE the order
 * removes the ordered lines from it — otherwise the late write would put them back (flushCart runs
 * first, inside the mutation).
 */
export function usePlaceOrder(input: PlaceOrderInput) {
  const { t } = useI18n();
  const router = useRouter();
  const invalidateMe = useInvalidateMe();
  const placeOrder = useCreateOrder(customerApi.checkout, flushCart);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** The last refusal was an anti-bot limit (TOO_MANY_UNPAID → link to my orders). */
  const [limitCode, setLimitCode] = useState<OrderLimitCode | null>(null);
  /** The order went through — on the way to its page (the cart is already empty by then). */
  const [placedId, setPlacedId] = useState<string | null>(null);

  async function submit() {
    if (submitting) return;
    setSubmitError(null);
    setLimitCode(null);
    setSubmitting(true);
    const { giftTier, giftDiscount } = input;
    const body = buildCreateOrderRequest({
      lines: input.lines,
      name: input.name,
      phone: input.phone,
      comment: input.comment,
      // A code the server already rejected must never be sent: the order came back 400 "invalid
      // promo code", and since the field lives in the cart there was no way to remove it from here —
      // the customer was stuck on the last step for good. The total shown on the button is the
      // undiscounted one in that case, so dropping the code charges exactly what was displayed.
      promoCode: input.promoValid ? input.promoCode.trim() : undefined,
      delivery: input.delivery,
      warehouse: input.warehouse,
      paymentOptionId: input.payment!.id,
      giftChoice: giftTier ? (giftDiscount > 0 ? "DISCOUNT" : "CASE") : undefined,
    });
    try {
      const created = await placeOrder.mutateAsync(body);
      const orderId = created.orderId;
      trackOrderCreated(orderId);
      if (giftTier && giftDiscount === 0) markGiftCaseAutoOpen(orderId);
      haptic();
      cartAfterOrder(input.lines.map((l) => l.key));
      setPlacedId(orderId);
      invalidateMe();
      // The "order created" step: the order page shows the amount, the 24 h countdown,
      // «Оплатити» (the in-app monobank sheet) and «Скасувати» (`?created=1`,
      // features/order/ui/payment/OrderPayment). Nothing opens by itself any more.
      router.replace(
        created.amountDueMinor > 0 ? `/account/orders/${orderId}?created=1` : `/account/orders/${orderId}`
      );
    } catch (e) {
      // The cart validated the code, so a rejection here means somebody took the last use in the
      // meantime. Drop it and let them place the order again at the price without it, instead of
      // leaving them on a step where the code cannot be edited.
      const failure = classifyOrderFailure(e);
      if (failure.kind === "promoRejected") {
        input.setPromoCode("");
        setSubmitError(t("checkout.promoDropped", { message: failure.message }));
      } else {
        // Anti-bot limits (TOO_MANY_UNPAID, ORDER_COOLDOWN, ORDER_DAILY_LIMIT, QTY_LIMIT,
        // CANCEL_LIMIT) come with a localized message that says what to do.
        setSubmitError(failure.message ?? t("checkout.failed"));
        setLimitCode(failure.kind === "limit" ? failure.code : null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, submitError, limitCode, placedId };
}
