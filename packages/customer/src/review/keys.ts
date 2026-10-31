/**
 * Ключи кэша отзывов. `locale` на сайте входит в ключ закрытых списков (названия строк приходят на языке экрана —
 * смена языка перезапрашивает); в Mini App его нет, и ключи остались прежними.
 */
export const reviewKeys = {
  product: (productId: string) => ["reviews", "product", productId] as const,
  pending: (orderId?: string, locale?: string) =>
    (locale === undefined
      ? ["me", "reviews", "pending", orderId ?? "all"]
      : orderId === undefined
        ? ["me", "reviews", "pending", locale]
        : ["me", "reviews", "pending", locale, orderId]) as readonly string[],
  pendingAll: ["me", "reviews", "pending"] as const,
  mine: (locale?: string) => (locale === undefined ? ["me", "reviews", "mine"] : ["me", "reviews", "mine", locale]) as readonly string[],
  bonuses: ["me", "bonuses"] as const,
  /** Префикс всех закрытых списков отзывов — для invalidateQueries. */
  allMine: ["me", "reviews"] as const,
};
