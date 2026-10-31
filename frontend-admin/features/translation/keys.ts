/** Ключи кэша фичи. Инвалидация — только по этим фабрикам. */
export const translationKeys = {
  stats: () => ["admin", "translations", "stats"] as const,
  export: () => ["admin", "translations", "export"] as const,
  /**
   * Корни кэша каталога, которые зависят от переводов (названия/описания товаров и категорий). `translation` —
   * нижний слой и не знает каталог, поэтому значения повторены здесь; источник — `catalogKeys` (features/catalog).
   */
  catalogRoots: () => [["products"], ["categories"]] as const,
};
