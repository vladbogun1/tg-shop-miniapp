/** Остаток товара для покупателя: одно правило вместо `stock > 0` по месту. */
interface Stocked {
  stock?: number | null;
  variants?: readonly { stock?: number | null }[] | null;
}

/**
 * Эффективный остаток: у варианта — свой, иначе сумма положительных остатков вариантов (у товара с вариантами
 * собственный stock = 0), иначе остаток товара.
 */
export function stockOf(product: Stocked, variant?: { stock?: number | null } | null): number {
  if (variant) return variant.stock ?? 0;
  if (product.variants && product.variants.length > 0) {
    return product.variants.reduce((sum, v) => sum + Math.max(0, v.stock ?? 0), 0);
  }
  return product.stock ?? 0;
}

/** Есть что купить: сам товар или любой из его вариантов. */
export function productInStock(product: Stocked): boolean {
  return stockOf(product) > 0;
}
