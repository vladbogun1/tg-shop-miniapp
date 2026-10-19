import type { Product } from "@shop/shared";

/** Units on hand: the sum over variants when the product has them. */
export function productStock(p: Pick<Product, "stock" | "variants">): number {
  return p.variants?.length ? p.variants.reduce((s, v) => s + (v.stock ?? 0), 0) : p.stock ?? 0;
}
