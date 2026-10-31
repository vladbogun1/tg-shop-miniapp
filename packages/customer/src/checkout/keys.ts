/**
 * Ключи кэша react-query оформления и доставки — единственное место (docs/ARCHITECTURE-FRONT.md, 2.5).
 * Значения не менять: те же ключи читают и сбрасывают экраны приложений.
 */

/** Справочники оформления (лимиты, отделения НП) меняются редко — свежие 10 минут. */
export const DIRECTORY_STALE_MS = 10 * 60_000;

export const checkoutKeys = {
  /** Проверка промокода по текущей сумме и составу корзины. */
  promo: (code: string, subtotal: number, items: string) => ["promo", code, subtotal, items] as const,
  orderLimits: () => ["public", "order-limits"] as const,
  /** Один элемент на город: поле отделения и кадрирование карты читают один и тот же список. */
  npWarehouses: (cityRef: string) => ["np-warehouses", cityRef] as const,
  npCities: (term: string) => ["np-cities", term] as const,
};
