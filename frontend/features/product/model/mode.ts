import type { Availability } from "@shop/core/availability";

export type PurchaseMode = "pick" | "buy" | "pre" | "out";

/** What the action bar offers: pick a variant first, buy, pre-order / notify, or nothing (out of stock). */
export function purchaseMode(needsVariant: boolean, avail: Availability, canNotify: boolean): PurchaseMode {
  if (needsVariant) return "pick";
  if (avail === "in_stock" || avail === "held") return "buy";
  return avail === "preorder" || canNotify ? "pre" : "out";
}

interface Stocked {
  stock?: number | null;
}

/** Stock of what is on screen: the chosen variant's, or the product's when it has no variants. */
export function stockOf(product: Stocked, variant: Stocked | null, hasVariants: boolean): number {
  return (hasVariants ? variant?.stock : product.stock) ?? 0;
}

/** A unit held for the customer is bought on top of the free stock: show product/variant with that stock. */
export function withHeldStock<P extends Stocked, V extends Stocked>(product: P, variant: V | null, hasVariants: boolean, held: boolean, buyable: number) {
  return {
    buyProduct: held && !hasVariants ? { ...product, stock: buyable } : product,
    buyVariant: held && variant ? { ...variant, stock: buyable } : variant,
  };
}
