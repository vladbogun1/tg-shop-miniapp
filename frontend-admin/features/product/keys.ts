import { procurementKeys } from "@/features/procurement";
import { catalogKeys } from "@/features/catalog";

/**
 * Ключи кэша товаров. Корень — `catalogKeys.productsRoot()` (общий с каталогом: он может сбросить товары, не
 * импортируя эту фичу); `list()` без аргумента — тот же корень, который держат выбор товара, заказы и предзаказы.
 */
export const productKeys = {
  root: () => catalogKeys.productsRoot(),
  /** Без аргумента — корень; `false`/`true` — список активных/архивных. */
  list: (archived?: boolean) => (archived === undefined ? catalogKeys.productsRoot() : ([...catalogKeys.productsRoot(), archived] as const)),
  /** Несколько товаров по id (`ids` — отсортированные через запятую), архивные тоже: страница поставки, поле подарка. */
  byIds: (ids: string) => [...catalogKeys.productsRoot(), "by-ids", ids] as const,
  /** Корень переводов, который держит окно товара (список переведённых текстов uk/en). */
  translatedRoot: () => ["translations"] as const,
  translatedUkEn: () => ["translations", "translated-uk-en"] as const,
  /** «Чего ждут» из предзаказов — для предложения раздать брони после поднятия остатка. */
  demand: () => procurementKeys.demand(),
  preordersRoot: () => procurementKeys.preordersRoot(),
};
