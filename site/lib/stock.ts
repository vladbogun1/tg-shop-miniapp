import type { Product, ProductVariant } from "@shop/shared";

/** Effective stock: the variant's own, else the sum of variants, else the product's. */
export function stockOf(product: Product, variant: ProductVariant | null): number {
  if (variant) return variant.stock;
  if (product.variants && product.variants.length > 0) {
    return product.variants.reduce((s, v) => s + Math.max(0, v.stock), 0);
  }
  return product.stock ?? 0;
}
