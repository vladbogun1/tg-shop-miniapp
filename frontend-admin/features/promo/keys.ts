/** Ключи кэша фичи. Инвалидация — только по этим фабрикам. */
export const promoKeys = {
  /** Корень: список кодов и «ручные скидки» под ним. */
  all: () => ["promocodes"] as const,
  manual: () => ["promocodes", "manual-discounts"] as const,
  orders: (id: string) => ["promo-orders", id] as const,
};
