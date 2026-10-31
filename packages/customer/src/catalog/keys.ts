/**
 * Ключи кэша react-query каталога — единственное место (docs/ARCHITECTURE-FRONT.md, 2.5).
 * Значения не менять: у приложений они исторически разные (схема каталога, карточки сравнения),
 * поэтому по варианту на приложение.
 */
export const catalogKeys = {
  /** Mini App: все товары (сбрасывается после предзаказа). */
  products: ["products"] as const,
  /** Mini App: схема каталога (фильтры, характеристики). */
  schemaInApp: (locale: string) => ["catalogSchema", locale] as const,
  /** Сайт: схема каталога. */
  schemaOnSite: (locale: string) => ["catalog-schema", locale] as const,
  /** Сайт: карточки для сравнения. */
  compareCards: (locale: string) => ["compare-cards", locale] as const,
  /** Сайт: подсказки поиска. */
  suggest: (term: string, locale: string) => ["suggest", term, locale] as const,
  /** Сайт: товар по id (форма обращения в поддержку). */
  productById: (id: string | null) => ["product", "byId", id] as const,
};
