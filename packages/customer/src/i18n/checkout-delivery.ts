/**
 * Тексты оформления checkout v2 на всех языках. Не в общем словаре: тот грузится на каждом маршруте, а эти
 * ~50 фраз × 3 языка нужны только экранам оформления (бюджет бандла, scripts/bundle-baseline.txt).
 *
 * Приложение подключает их хуком `useCheckoutT()` (frontend/i18n, site/i18n) — модуль попадает только в чанки,
 * которые этот хук импортируют. Ключ ищется здесь, остальное — обычным `t` приложения. Полноту языков и сирот
 * проверяет scripts/check-i18n.mjs.
 */
import { translate, type Locale, type Params } from "@shop/core/i18n";
import { checkoutDeliveryEn } from "./checkout-delivery-en";
import { checkoutDeliveryRu } from "./checkout-delivery-ru";
import { checkoutDeliveryUk } from "./checkout-delivery-uk";

export type CheckoutDeliveryKey = keyof typeof checkoutDeliveryRu;

const TEXTS: Record<Locale, Record<CheckoutDeliveryKey, string>> = {
  ru: checkoutDeliveryRu,
  uk: checkoutDeliveryUk,
  en: checkoutDeliveryEn,
};

/** `t` приложения, который знает и тексты оформления. */
export function withCheckoutTexts<K extends string>(
  t: (key: K, params?: Params) => string,
  locale: Locale,
): (key: K | CheckoutDeliveryKey, params?: Params) => string {
  const dict = TEXTS[locale];
  return (key, params) => (key in dict ? translate(dict, locale, key, params) : t(key as K, params));
}
