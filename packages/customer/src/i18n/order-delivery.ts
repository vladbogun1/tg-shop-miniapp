/**
 * Тексты доставки страницы заказа и оформления на всех языках (посылка, «Відстежити», наложка, «сумма без доставки»).
 * Не в общем словаре: список заказов и остальные маршруты их не грузят (бюджет бандла, scripts/bundle-baseline.txt).
 * Приложение подключает их хуками `useOrderDeliveryT()` / `useCheckoutT()` (frontend/i18n, site/i18n).
 */
import { orderDeliveryEn } from "./order-delivery-en";
import { orderDeliveryRu } from "./order-delivery-ru";
import { orderDeliveryUk } from "./order-delivery-uk";
import type { ScopedTexts } from "./scoped-texts";

export type OrderDeliveryKey = keyof typeof orderDeliveryRu;

export const ORDER_DELIVERY_TEXTS: ScopedTexts<OrderDeliveryKey> = { ru: orderDeliveryRu, uk: orderDeliveryUk, en: orderDeliveryEn };
