/**
 * Словарь «только для своих экранов»: тексты, которые не кладём в общий словарь (он грузится на каждом маршруте),
 * подключаются к `t` приложения поверх. Ключ ищется в своём словаре, остальное — обычным `t`.
 * Такие словари: order-delivery (страница заказа), checkout-delivery (оформление); проверяет scripts/check-i18n.mjs.
 */
import { translate, type Locale, type Params } from "@shop/core/i18n";

export type ScopedTexts<S extends string> = Record<Locale, Record<S, string>>;

/** `t` приложения, который знает и тексты `texts`. */
export function withScopedTexts<K extends string, S extends string>(
  t: (key: K, params?: Params) => string,
  locale: Locale,
  texts: ScopedTexts<S>,
): (key: K | S, params?: Params) => string {
  const dict = texts[locale];
  return (key, params) => (key in dict ? translate(dict, locale, key, params) : t(key as K, params));
}
