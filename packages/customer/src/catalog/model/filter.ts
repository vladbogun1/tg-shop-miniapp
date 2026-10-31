/**
 * Пустые значения каталога, общие для витрин: «нет фильтра» и «схема ещё не загрузилась».
 * Сам движок фильтров/фасетов — `@shop/core/catalog` (одна реализация); здесь только константы состояния.
 */
import type { CatalogFilter, CatalogSchema } from "@shop/core/catalog";

/** Заглушка, пока схема грузится (или на старом бэкенде): движок всё равно ищет и сортирует. */
export const EMPTY_SCHEMA: CatalogSchema = { categories: [], brands: [], groups: [], attributes: [], conditions: [] };

/** Фильтр без единого условия (поиск `q` не входит). */
export const EMPTY_FILTER: CatalogFilter = {
  category: null,
  brands: [],
  conditions: [],
  priceMin: null,
  priceMax: null,
  inStock: false,
  attrs: {},
};
