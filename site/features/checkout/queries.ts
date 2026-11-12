"use client";

/** Checkout hooks: prefill from the last order, and the payment option the customer can pick. */
import { useQuery } from "@tanstack/react-query";
import { siteCheckoutKeys } from "@shop/customer/checkout/keys";
import { meKeys } from "@shop/customer/account/keys";
import { useEffect, useRef, useState } from "react";
import { useLatest } from "@shop/ui/use-latest";
import { useOnlinePaymentOnly } from "@shop/customer/checkout/online-payment-only";
import { useChosenPayment } from "@shop/customer/checkout/payment-choice";
import { giftProgress, guaranteedDiscountMinor, type GiftChoice } from "@shop/core/giftcase";
import type { NpOrderDetail } from "@shop/customer/delivery/contract";
import type { DeliveryTab } from "@shop/customer/delivery/tabs";
import type { DeliveryDraftState } from "@shop/customer/delivery/use-delivery-draft";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { useGift } from "@/features/gift";
import { usePromoPreview } from "./ui/PromoField";

interface PrefillTargets {
  setPhone: (f: (v: string) => string) => void;
  setPrefilled: (v: boolean) => void;
}

/**
 * Fills the recipient, the phone and the delivery from the customer's latest order, once, and never over
 * their input: tab, city and point by ref (the point is looked up in its city's list), the courier address.
 */
export function useLastOrderPrefill(d: DeliveryDraftState, target: PrefillTargets) {
  const lastOrder = useQuery({
    queryKey: meKeys.lastOrder,
    staleTime: Infinity,
    queryFn: async (): Promise<NpOrderDetail | null> => {
      const list = await api.orders();
      const latest = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return latest ? api.order(latest.id) : null;
    },
  });

  const prefillDone = useRef(false);
  const latest = useLatest({ d, target });
  useEffect(() => {
    const o = lastOrder.data;
    const { d: live, target: out } = latest.current;
    if (!o || prefillDone.current) return;
    prefillDone.current = true;
    if (o.phone) out.setPhone((v) => v || o.phone);
    if (o.phone || o.customerName) out.setPrefilled(true);
    live.applyLastOrder(o, false);
  }, [lastOrder.data, latest]);
}

/**
 * Payment options for `total` and the delivery `tab`, and the chosen one (rules: @shop/customer/checkout/payment-choice).
 * A prepayment option is hidden when the whole order costs no more than the prepayment; «оплата при отриманні» is
 * offered only where the server allows it and is never switched to silently. `dueNow` is for the button and the
 * summary; the server answers with the same amountDueMinor.
 */
export function usePaymentChoice(total: number, tab: DeliveryTab) {
  const { locale } = useI18n();
  const query = useQuery({ queryKey: siteCheckoutKeys.paymentOptions(locale), queryFn: () => api.checkout.paymentOptions() });
  // Оформление открыто только вошедшим (CheckoutView), так что /api/me можно спрашивать сразу.
  const onlineOnly = useOnlinePaymentOnly(api.checkout, true);
  const pay = useChosenPayment(query.data, total, onlineOnly, tab);
  const status: "loading" | "error" | "ready" = query.isLoading ? "loading" : query.isError ? "error" : "ready";
  return { ...pay, status, noneForDelivery: !!query.data?.length && pay.options.length === 0 };
}

/**
 * Money of the order: the promo preview, the gift tier reached on the total after the promo (the case,
 * the default, or the tier's guaranteed discount — counted like the server does), and the final total.
 */
export function useCheckoutTotals(promoCode: string, subtotal: number) {
  const promo = usePromoPreview(promoCode, subtotal);
  const discount = promo.discount;
  const baseTotal = Math.max(0, subtotal - discount);
  const giftNow = giftProgress(useGift(), baseTotal);
  const gift = giftNow?.reached ? giftNow : null;
  const [giftChoice, setGiftChoice] = useState<GiftChoice>("CASE");
  const giftTier = gift?.kind === "CASE" ? gift.tier : null;
  const giftDiscount = giftChoice === "DISCOUNT" ? guaranteedDiscountMinor(giftTier, baseTotal) : 0;
  return {
    promo,
    promoValid: promo.data?.valid === true,
    discount,
    baseTotal,
    gift,
    giftTier,
    giftChoice,
    setGiftChoice,
    giftDiscount,
    total: baseTotal - giftDiscount,
  };
}
