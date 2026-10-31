/** Ключи кэша react-query оформления заказа (значения те же, что были литералами). */
export const checkoutKeys = {
  lastOrder: ["me", "last-order"] as const,
  paymentOptions: ["payment-options"] as const,
  /** Всё «моё» (заказы, корзина…): после создания заказа перечитывается. */
  me: ["me"] as const,
};
