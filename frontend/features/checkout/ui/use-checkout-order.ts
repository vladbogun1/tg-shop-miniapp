"use client";

import { useEffect, useState } from "react";
import { giftProgress, guaranteedDiscountMinor, type GiftChoice } from "@shop/core/giftcase";
import { visiblePaymentOptions } from "@shop/core/orders";
import { usePromoPreview } from "@/features/cart";
import { useGift } from "@/features/gift";
import { dueNowOf, resolvePayment } from "../model/totals";
import { usePaymentOptionsQuery } from "../queries";

/**
 * Step 3–4 money: the promo preview (same check the cart runs, so the two screens cannot disagree
 * about the price — it also keeps refreshing the hold on a limited code), the gift of the order sum,
 * the visible payment options, the chosen one and what is payable now.
 */
export function useCheckoutOrder(promoCode: string, subtotal: number) {
  const paymentQuery = usePaymentOptionsQuery();
  const promo = usePromoPreview(promoCode, subtotal);
  const discount = promo.discount;
  const baseTotal = Math.max(0, subtotal - discount);
  const giftNow = giftProgress(useGift(), baseTotal);
  const gift = giftNow?.reached ? giftNow : null;
  // Gift tier reached: the customer picks the case (default) or the tier's guaranteed discount on
  // this order — the server counts both from the total after the promo code, like here.
  const [giftChoice, setGiftChoice] = useState<GiftChoice>("CASE");
  const giftTier = gift?.kind === "CASE" ? gift.tier : null;
  const giftDiscount = giftChoice === "DISCOUNT" ? guaranteedDiscountMinor(giftTier, baseTotal) : 0;
  const total = baseTotal - giftDiscount;

  const [paymentId, setPaymentId] = useState<string | null>(null);
  // A prepayment option is hidden when the whole order costs no more than the prepayment. The choice
  // is derived here so the summary never shows a hidden option, and synced into state below so it sticks.
  const paymentOptions = visiblePaymentOptions(paymentQuery.data ?? [], total);
  const chosenPayment = resolvePayment(paymentOptions, paymentId);
  const chosenPaymentId = chosenPayment?.id ?? null;
  const optionsLoaded = !!paymentQuery.data;
  useEffect(() => {
    if (optionsLoaded && chosenPaymentId !== paymentId) setPaymentId(chosenPaymentId);
  }, [optionsLoaded, chosenPaymentId, paymentId]);

  return {
    paymentQuery,
    promoPreview: promo.data,
    promoValid: promo.data?.valid === true,
    discount,
    baseTotal,
    gift,
    giftChoice,
    setGiftChoice,
    giftTier,
    giftDiscount,
    total,
    paymentOptions,
    chosenPayment,
    chosenPaymentId,
    setPaymentId,
    dueNow: dueNowOf(chosenPayment, total),
  };
}
