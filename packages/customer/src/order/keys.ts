/**
 * Ключи кэша react-query заказов покупателя — единственное место (docs/ARCHITECTURE-FRONT.md, 2.5, шаг 5c).
 * Значения не менять: те же ключи читают и сбрасывают экраны приложений (в т.ч. gift-case, оплата).
 */
export const orderKeys = {
  /** Список заказов: сбрасывается префиксом после оплаты, отмены, подарка. */
  list: () => ["me", "orders"] as const,
  /**
   * Один заказ. Mini App: `["me","orders",id]`. Сайт кладёт язык последним элементом, потому что ответ
   * локализован, а страница заказа в кэше браузера не должна показывать чужой язык.
   */
  detail: (id: string, locale?: string) =>
    locale === undefined ? (["me", "orders", id] as const) : (["me", "orders", id, locale] as const),
  messages: (id: string) => ["me", "orders", id, "messages"] as const,
  receipts: (id: string) => ["me", "orders", id, "receipts"] as const,
};
