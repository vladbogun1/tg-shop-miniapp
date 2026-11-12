"use client";

/**
 * `t` экранов оформления: словарь приложения + тексты доставки заказа (order-delivery) + тексты checkout v2
 * (checkout-delivery). Те тексты не в общем словаре (он грузится на каждом маршруте) — сюда попадают только чанки,
 * импортирующие этот хук.
 */
import { useMemo } from "react";
import { CHECKOUT_TEXTS } from "@shop/customer/i18n/checkout-delivery";
import { ORDER_DELIVERY_TEXTS } from "@shop/customer/i18n/order-delivery";
import { withScopedTexts } from "@shop/customer/i18n/scoped-texts";
import { useI18n } from "./context";

export function useCheckoutT() {
  const { t, locale } = useI18n();
  return useMemo(() => withScopedTexts(withScopedTexts(t, locale, ORDER_DELIVERY_TEXTS), locale, CHECKOUT_TEXTS), [t, locale]);
}

export type CheckoutT = ReturnType<typeof useCheckoutT>;
