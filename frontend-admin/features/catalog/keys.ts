/**
 * Ключи кэша справочника каталога. Инвалидация — только по этим фабрикам.
 * Корни `cardsRoot` / `productsRoot` общие с фичами «карточки» и «товар»: они строят свои ключи под ними,
 * а каталог может сбросить их, не импортируя эти фичи.
 */
export const catalogKeys = {
  categories: () => ["categories"] as const,
  brands: () => ["brands"] as const,
  specGroups: () => ["spec-groups"] as const,
  /** Без id — корень (все категории), с id — характеристики одной категории. */
  specAttributes: (categoryId?: string) => (categoryId === undefined ? (["spec-attributes"] as const) : (["spec-attributes", categoryId] as const)),
  /** Схема каталога в виде редактора (`AdminCatalogSchema`). */
  schema: () => ["catalog-schema"] as const,
  /** Схема каталога в виде «Карточек» (свой разбор в lib/cards-api.ts) — тот же эндпоинт, другой кэш. */
  cardSchema: () => ["admin", "catalog", "schema"] as const,
  catalogRoot: () => ["admin", "catalog"] as const,
  cardsRoot: () => ["admin", "cards"] as const,
  cardsStats: () => ["admin", "cards", "stats"] as const,
  cardsExport: () => ["admin", "cards", "export"] as const,
  productsRoot: () => ["products"] as const,
};
