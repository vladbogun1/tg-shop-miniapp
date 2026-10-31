import type { AdminProduct } from "./types";

/** Остаток товара: сумма остатков вариантов, а без вариантов — собственный. */
export function effStock(p: AdminProduct): number {
  if (p.variants && p.variants.length > 0) {
    return p.variants.reduce((s, v) => s + (v.stock ?? 0), 0);
  }
  return p.stock ?? 0;
}

/** Создан короткой формой и ещё не опубликован/архивирован (флаг бэкенда, V53). */
export function isUnfinished(p: AdminProduct): boolean {
  return p.unfinished === true;
}

/** Группа «умной» сортировки: на витрине, но закончился (0) → в наличии (1) → скрыт (2). */
export function smartGroup(p: AdminProduct): number {
  if (p.active === false) return 2;
  return effStock(p) === 0 ? 0 : 1;
}
