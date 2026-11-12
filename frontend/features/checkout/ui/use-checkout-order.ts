"use client";

import { useState } from "react";
import { giftProgress, guaranteedDiscountMinor, type GiftChoice } from "@shop/core/giftcase";
import { useOnlinePaymentOnly } from "@shop/customer/checkout/online-payment-only";
import { useChosenPayment } from "@shop/customer/checkout/payment-choice";
import type { DeliveryTab } from "@shop/customer/delivery/tabs";
import { usePromoPreview } from "@/features/cart";
import { useGift } from "@/features/gift";
import { customerApi } from "@/lib/api";
import { useAccessToken } from "@/lib/auth";
import { usePaymentOptionsQuery } from "../queries";

/**
 * Step 3–4 money: the promo preview (same check the cart runs, so the two screens cannot disagree
 * about the price — it also keeps refreshing the hold on a limited code), the gift of the order sum,
 * the payment options for this delivery and sum (incl. «оплата при отриманні» where allowed), the chosen one and
 * what is payable now / on delivery.
 */
export function useCheckoutOrder(promoCode: string, subtotal: number, tab: DeliveryTab) {
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

  // /api/me ждёт токен Telegram: до него метки не знаем, а сервер всё равно не примет предоплату помеченному.
  const token = useAccessToken();
  const onlineOnly = useOnlinePaymentOnly(customerApi.checkout, !!token);
  const pay = useChosenPayment(paymentQuery.data, total, onlineOnly, tab);

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
    paymentOptions: pay.options,
    chosenPayment: pay.chosen,
    chosenPaymentId: pay.chosenId,
    setPaymentId: pay.choose,
    dueNow: pay.dueNow,
    payOnDelivery: pay.payOnDelivery,
    onDelivery: pay.onDelivery,
    paymentSwitched: pay.switched,
    /** Варианты есть, но ни один не подходит к этой доставке или сумме. */
    noneForDelivery: !!paymentQuery.data?.length && pay.options.length === 0,
  };
}
