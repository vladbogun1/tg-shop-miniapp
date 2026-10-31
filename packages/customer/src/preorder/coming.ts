/**
 * Индекс открытых партий: «товар / вариант → срок». Партии приходят ближайшей первой, побеждает первая.
 * Чистая функция: её зовут и сервер сайта (витрина, фиды), и хук Mini App.
 */
import type { ComingBatch, PreorderEta } from "./types";

export interface PreorderIndex {
  /** Любая строка товара, какой бы ни был вариант (для плитки: «товар в пути»). */
  any: Map<string, PreorderEta>;
  /** Строка именно этого варианта (`productId::variantId`). */
  variants: Map<string, PreorderEta>;
  /** Строка самого товара (без вариантов). */
  products: Map<string, PreorderEta>;
  /** Срок брони ближайшей партии товара, часы (если партия его прислала). */
  holdHours: Map<string, number>;
  /** Товары в порядке партий. */
  order: string[];
  size: number;
}

export function buildPreorderIndex(batches: ComingBatch[]): PreorderIndex {
  const idx: PreorderIndex = { any: new Map(), variants: new Map(), products: new Map(), holdHours: new Map(), order: [], size: 0 };
  for (const b of batches) {
    for (const l of b.lines) {
      if (!idx.any.has(l.productId)) {
        idx.any.set(l.productId, b.eta);
        idx.order.push(l.productId);
        if (b.holdHours && b.holdHours > 0) idx.holdHours.set(l.productId, b.holdHours);
      }
      if (l.variantId) {
        const k = `${l.productId}::${l.variantId}`;
        if (!idx.variants.has(k)) idx.variants.set(k, b.eta);
      } else if (!idx.products.has(l.productId)) {
        idx.products.set(l.productId, b.eta);
      }
    }
  }
  idx.size = idx.any.size;
  return idx;
}
