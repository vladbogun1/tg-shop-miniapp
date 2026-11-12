"use client";

/**
 * `t` экранов оформления: словарь приложения + тексты доставки заказа (order-delivery) + тексты checkout v2
 * (checkout-delivery). Тексты одного языка (из URL) даёт сервер — страница оборачивает экран в
 * `CheckoutTextsProvider` (features/checkout/server/texts.ts); словари всех языков в клиентский бандл не попадают.
 */
import { createContext, createElement, type ReactNode, useContext, useMemo } from "react";
import type { CheckoutDeliveryKey } from "@shop/customer/i18n/checkout-delivery";
import type { OrderDeliveryKey } from "@shop/customer/i18n/order-delivery";
import { withLocaleTexts } from "@shop/customer/i18n/scoped-texts";
import { useI18n } from "./context";

export type CheckoutTexts = Record<CheckoutDeliveryKey | OrderDeliveryKey, string>;

const CheckoutTextsContext = createContext<CheckoutTexts | null>(null);

export function CheckoutTextsProvider({ texts, children }: { texts: CheckoutTexts; children: ReactNode }) {
  return createElement(CheckoutTextsContext.Provider, { value: texts }, children);
}

export function useCheckoutT() {
  const { t, locale } = useI18n();
  const texts = useContext(CheckoutTextsContext);
  if (!texts) throw new Error("useCheckoutT: нет CheckoutTextsProvider (страница оформления передаёт тексты с сервера)");
  return useMemo(() => withLocaleTexts(t, locale, texts), [t, locale, texts]);
}

export type CheckoutT = ReturnType<typeof useCheckoutT>;
