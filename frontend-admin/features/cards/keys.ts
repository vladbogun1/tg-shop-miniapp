import { catalogKeys } from "@/features/catalog";

/**
 * Ключи кэша «Карточек». Корни (`["admin","cards"]`, схема каталога) объявляет catalog — он сбрасывает их при правках
 * справочника, не зная про эту фичу; здесь ключи строятся под теми же корнями, поэтому сброс по префиксу работает.
 */
export const cardsKeys = {
  root: () => catalogKeys.cardsRoot(),
  /** Бейдж меню и счётчики вкладок. */
  stats: () => catalogKeys.cardsStats(),
  /** Все товары с данными карточки (список «Карточек»). */
  export: () => catalogKeys.cardsExport(),
  /** Один товар (окно оформления). */
  exportOne: (productId: string) => [...catalogKeys.cardsExport(), "one", productId] as const,
  reviewRoot: () => [...catalogKeys.cardsRoot(), "review"] as const,
  review: (productId: string) => [...catalogKeys.cardsRoot(), "review", productId] as const,
  /** Схема каталога в виде «Карточек» (свой разбор, `normalizeSchema`). */
  schema: () => catalogKeys.cardSchema(),
};
