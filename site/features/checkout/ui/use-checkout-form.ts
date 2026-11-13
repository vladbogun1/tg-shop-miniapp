"use client";

/**
 * State of the site checkout: recipient and phone, delivery (checkout v2 tabs, point, courier), payment, money,
 * the «≈ N ₴» estimate and the order request. The form (CheckoutForm) only lays it out.
 *
 * Order creation is exactly the Mini App's: POST /api/orders with an Idempotency-Key per attempt, the promo code
 * sent ONLY when the server has just confirmed it, PROMO_REJECTED handled by dropping the code.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isValidPhone } from "@shop/core/phone";
import { usePlaceOrder } from "@shop/customer/checkout/use-place-order";
import { deliveryOk as isDeliveryOk } from "@shop/customer/delivery/draft";
import { estimateRequestOf } from "@shop/customer/delivery/estimate";
import { recipientOk as isRecipientOk } from "@shop/customer/delivery/recipient";
import { useDeliveryDraft } from "@shop/customer/delivery/use-delivery-draft";
import { useDeliveryEstimate, useNpConfig } from "@shop/customer/delivery/use-np-delivery";
import { orderCreatedHref } from "@/features/payment";
import { useI18n } from "@/i18n/context";
import { trackOrderCreated } from "@/lib/analytics";
import { api } from "@/lib/api";
import { webPlatform } from "@/lib/platform";
import { cartAfterOrder, flushCart, useCart, useCartSubtotal, useCartValidation } from "@/features/cart";
import { firstInvalidSection } from "../model/sections";
import { useCheckoutTotals, useLastOrderPrefill, usePaymentChoice } from "../queries";

export function useCheckoutForm(onPlaced: (orderId: string) => void) {
  const { t, href } = useI18n();
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const promoCode = useCart((s) => s.promoCode);
  const setPromoCode = useCart((s) => s.setPromoCode);
  const subtotal = useCartSubtotal();
  const currency = lines[0]?.currency ?? "UAH";
  useCartValidation(true);

  const [phone, setPhone] = useState("");
  const npConfig = useNpConfig(api.checkout);
  // Tab, recipient, city, point, courier address — @shop/customer/delivery/use-delivery-draft (same as the Mini App).
  const d = useDeliveryDraft(api.checkout, npConfig.tabs);
  const [comment, setComment] = useState("");
  const [touched, setTouched] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  useLastOrderPrefill(d, { setPhone, setPrefilled });

  const totals = useCheckoutTotals(promoCode, subtotal);
  const { total } = totals;
  const pay = usePaymentChoice(total, d.tab);
  const orderable = lines.filter((l) => l.stock > 0);
  const estimate = useDeliveryEstimate(api.checkout, estimateRequestOf(d.draft, orderable, total, pay.payOnDelivery), npConfig.estimateEnabled);

  const recipientOk = isRecipientOk(d.recipient, d.draft.tab === "PICKUP");
  const phoneOk = isValidPhone(phone);
  const deliveryOk = isDeliveryOk(d.draft);
  const paymentOk = !!pay.chosen;
  const hasProblems = lines.some((l) => l.stock <= 0);
  const formOk = recipientOk && phoneOk && deliveryOk && paymentOk && !hasProblems && subtotal > 0;

  // The scenario is shared with the Mini App; the site's own: cart store, analytics, the way to the order page.
  const place = usePlaceOrder(
    {
      api: api.checkout,
      platform: webPlatform,
      t,
      beforePlace: flushCart,
      dropPromo: () => setPromoCode(""),
      onPlaced(created, orderedKeys) {
        trackOrderCreated(created.orderId);
        cartAfterOrder(orderedKeys);
        onPlaced(created.orderId);
        const orderPage = href(`/account/orders/${created.orderId}`);
        // Something to pay: the order page shows the "order created" step — amount, 24 h countdown,
        // «Оплатити» and «Скасувати». Nothing opens by itself. Pay on delivery: 0 now, straight to the order.
        router.push(created.amountDueMinor > 0 ? orderCreatedHref(orderPage) : orderPage);
      },
    },
    {
      lines: orderable,
      phone,
      comment,
      promoCode,
      promoValid: totals.promoValid,
      draft: d.draft,
      payment: pay.chosen,
      giftTier: totals.giftTier,
      giftDiscount: totals.giftDiscount,
    },
  );

  function submit() {
    setTouched(true);
    if (!formOk) {
      place.setSubmitError(hasProblems ? t("cart.hasProblems") : t("checkout.fixErrors"));
      const section = firstInvalidSection({ nameOk: recipientOk, phoneOk, deliveryOk });
      document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    void place.submit();
  }

  return {
    lines,
    currency,
    subtotal,
    promoCode,
    setPromoCode,
    phone,
    setPhone,
    comment,
    setComment,
    touched,
    prefilled,
    d,
    tabs: npConfig.tabs,
    totals,
    pay,
    estimate,
    paymentOk,
    phoneOk,
    place,
    submit,
  };
}
