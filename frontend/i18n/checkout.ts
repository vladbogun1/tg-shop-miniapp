"use client";

/**
 * `t` экранов оформления: словарь приложения + тексты checkout v2 из @shop/customer/i18n/checkout-delivery.
 * Те тексты не в общем словаре (он грузится на каждом маршруте) — сюда попадают только чанки, импортирующие этот хук.
 */
import { useMemo } from "react";
import { withCheckoutTexts } from "@shop/customer/i18n/checkout-delivery";
import { useI18n } from "./context";

export function useCheckoutT() {
  const { t, locale } = useI18n();
  return useMemo(() => withCheckoutTexts(t, locale), [t, locale]);
}

export type CheckoutT = ReturnType<typeof useCheckoutT>;
