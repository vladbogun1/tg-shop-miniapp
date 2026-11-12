/**
 * Тексты оформления checkout v2 на всех языках. Не в общем словаре: тот грузится на каждом маршруте, а эти
 * ~50 фраз × 3 языка нужны только экранам оформления (бюджет бандла, scripts/bundle-baseline.txt).
 *
 * Приложение подключает их хуком `useCheckoutT()` (frontend/i18n, site/i18n) — модуль попадает только в чанки,
 * которые этот хук импортируют. Полноту языков и сирот проверяет scripts/check-i18n.mjs.
 */
import { checkoutDeliveryEn } from "./checkout-delivery-en";
import { checkoutDeliveryRu } from "./checkout-delivery-ru";
import { checkoutDeliveryUk } from "./checkout-delivery-uk";
import type { ScopedTexts } from "./scoped-texts";

export type CheckoutDeliveryKey = keyof typeof checkoutDeliveryRu;

export const CHECKOUT_TEXTS: ScopedTexts<CheckoutDeliveryKey> = { ru: checkoutDeliveryRu, uk: checkoutDeliveryUk, en: checkoutDeliveryEn };
