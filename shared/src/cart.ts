/**
 * Server-side cart contract (`/api/me/cart`, docs/SITE-SPEC.md «Серверная корзина»), shared by the
 * website and the Mini App: one Telegram account, one cart.
 */

/** Why a stored line cannot be ordered right now. */
export type CartLineProblem = "INACTIVE" | "OUT_OF_STOCK" | "VARIANT_REQUIRED";

/** A line with TODAY's product data, in the request language. */
export interface ServerCartLine {
  productId: string;
  variantId: string | null;
  quantity: number;
  title: string;
  slug: string | null;
  variantName: string | null;
  imageUrl: string | null;
  priceMinor: number;
  compareAtMinor: number | null;
  currency: string;
  /** Effective stock: the variant's, else the sum of variants, else the product's. */
  stock: number;
  available: boolean;
  problem: CartLineProblem | null;
  addedAt: string;
}

export interface ServerCart {
  /** Grows with every change on any device (and at checkout); 0 = never written. */
  version: number;
  updatedAt: string | null;
  lines: ServerCartLine[];
  maxLines: number;
  maxQuantity: number;
}

/** What clients send: PUT /api/me/cart (replace) and POST /api/me/cart/merge. */
export interface CartLineInput {
  productId: string;
  variantId: string | null;
  quantity: number;
}

/** Order-insensitive fingerprint of a cart's lines (product, variant, quantity). */
export function cartSignature(lines: readonly CartLineInput[]): string {
  return lines
    .map((l) => `${l.productId}:${l.variantId ?? ""}:${l.quantity}`)
    .sort()
    .join("|");
}
