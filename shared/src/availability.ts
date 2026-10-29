/**
 * Availability of a product / variant for the customer frontends (docs/PREORDERS-PLAN.md §6.3):
 * one answer instead of scattered `stock > 0` checks.
 *
 * - `in_stock`     — can be bought now;
 * - `held`         — the catalog stock is 0 (it is net of reservations, mine included), but a unit is
 *                    held for the signed-in customer, who may still buy it;
 * - `preorder`     — sold out, an open batch brings it («їде до нас»);
 * - `out_of_stock` — sold out, nothing is coming.
 */
export type Availability = "in_stock" | "held" | "preorder" | "out_of_stock";

interface StockSource {
  stock?: number | null;
  variants?: readonly { stock?: number | null }[] | null;
}

/** What the caller knows beyond the catalog stock. */
export interface AvailabilityPreorder {
  /** An open batch brings this line. */
  coming?: boolean;
  /** Units held for the signed-in customer. */
  heldQty?: number | null;
}

/**
 * `variant` given = that variant's own stock; else the sum of the variants' positive stock for a
 * product with variants (product-level stock stays 0 there); else the product's stock.
 */
export function availabilityOf(
  product: StockSource,
  variant?: { stock?: number | null } | null,
  preorder?: AvailabilityPreorder | null,
): Availability {
  const stock = variant
    ? (variant.stock ?? 0)
    : product.variants && product.variants.length > 0
      ? product.variants.reduce((s, v) => s + Math.max(0, v.stock ?? 0), 0)
      : (product.stock ?? 0);
  if (stock > 0) return "in_stock";
  if ((preorder?.heldQty ?? 0) > 0) return "held";
  return preorder?.coming ? "preorder" : "out_of_stock";
}
