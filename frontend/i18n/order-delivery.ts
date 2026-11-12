"use client";

/**
 * `t` страницы заказа: словарь приложения + тексты доставки заказа из @shop/customer/i18n/order-delivery
 * (посылка, «Відстежити», наложка). Они не в общем словаре — сюда попадают только чанки, импортирующие этот хук.
 */
import { useMemo } from "react";
import { ORDER_DELIVERY_TEXTS } from "@shop/customer/i18n/order-delivery";
import { withScopedTexts } from "@shop/customer/i18n/scoped-texts";
import { useI18n } from "./context";

export function useOrderDeliveryT() {
  const { t, locale } = useI18n();
  return useMemo(() => withScopedTexts(t, locale, ORDER_DELIVERY_TEXTS), [t, locale]);
}
