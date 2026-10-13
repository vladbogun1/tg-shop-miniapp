/**
 * «Вместе дешевле» (accessories with a discount next to a product) and the gift for the order sum,
 * shared by the Mini App and the website. Backend: com.maxsolch.shop.bundle (BundleService,
 * BundlePricing), endpoints under /api/public/bundles (no sign-in).
 *
 * One discount per order: the bundle discount or the promo code, whichever is better for the
 * customer. The checkout prices the bundle again on the server, so the numbers here are for showing;
 * the cart asks the server (`quote`), the product page prices its own block with `bundleDiscount`
 * (all offered items are eligible by construction, so only the tier and the rounding matter).
 */
import type { Product } from "./types";

export interface BundleTerms {
  enabled: boolean;
  /** Percent for 1, 2, 3 add-ons (e.g. [5, 10, 15]). */
  tiers: number[];
  /** An add-on costs at most this % of the main product. */
  maxAddonPricePercent: number;
  /** Per-order cap of the bundle discount in minor units; 0 = none. */
  maxDiscountMinor: number;
}

/** GET /api/public/bundles/product/{id} */
export interface BundleProductOffer {
  productId: string;
  terms: BundleTerms;
  /** Accessories to offer, best first; empty = show nothing. */
  items: Product[];
}

export interface BundleQuoteLineRequest {
  productId: string;
  variantId?: string | null;
  quantity: number;
}

/** POST /api/public/bundles/quote body. */
export interface BundleQuoteRequest {
  lines: BundleQuoteLineRequest[];
  /** What the customer's promo code gives (already previewed by the app) — to say which discount wins. */
  promoDiscountMinor?: number | null;
}

export interface BundleQuoteLine {
  productId: string;
  variantId: string | null;
  percent: number;
  /** Units of the line that got the discount (at most 3 in the whole cart). */
  units: number;
  discountMinor: number;
}

export interface BundleGift {
  thresholdMinor: number;
  /** Still to add (after the discount) to get the gift; 0 = reached. */
  remainingMinor: number;
  reached: boolean;
  /** PRODUCT: one known gift; CASE: a random prize from caseItems (gift case, see ./giftcase). */
  kind: "PRODUCT" | "CASE";
  /** The gift (kind PRODUCT); null for a case. */
  product: Product | null;
  /** Prizes of the case with chances, most common first (kind CASE). */
  caseItems: import("./giftcase").CaseItem[];
}

export type BundleDiscountKind = "BUNDLE" | "PROMO";

/** POST /api/public/bundles/quote response. */
export interface BundleQuote {
  subtotalMinor: number;
  bundleDiscountMinor: number;
  bundlePercent: number;
  /** Add-on lines with their share of the bundle discount. */
  lines: BundleQuoteLine[];
  /** The discount the order will get — only one of the two. */
  discountKind: BundleDiscountKind | null;
  discountMinor: number;
  totalMinor: number;
  /** Accessories for what is in the cart (not already in it). */
  suggestions: Product[];
  terms: BundleTerms;
  /** null = the gift is off or out of stock. */
  gift: BundleGift | null;
}

/** Add-on units that get the discount; more do not raise the tier (BundlePricing.MAX_ADDON_UNITS). */
export const BUNDLE_MAX_ADDON_UNITS = 3;

/** Percent for `units` add-ons (1..3), 0 for none. */
export function bundlePercent(terms: Pick<BundleTerms, "tiers">, units: number): number {
  if (units <= 0 || !terms.tiers?.length) return 0;
  const i = Math.min(units, terms.tiers.length, BUNDLE_MAX_ADDON_UNITS) - 1;
  return Math.max(0, Math.min(100, terms.tiers[i] ?? 0));
}

/** Discount of one unit: `percent` of the price, rounded down to whole hryvnias (as on the server). */
export function bundleUnitDiscount(unitPriceMinor: number, percent: number): number {
  return Math.floor((unitPriceMinor * percent) / 100 / 100) * 100;
}

/**
 * Bundle discount for one unit of each of `addonPrices` next to the main product (product page):
 * the dearest three get the tier percent, then the per-order cap. Mirrors BundlePricing.compute for a
 * cart of «main product + these accessories».
 */
export function bundleDiscount(terms: BundleTerms, addonPrices: number[]): { percent: number; discountMinor: number; perItem: number[] } {
  if (!terms.enabled || addonPrices.length === 0) return { percent: 0, discountMinor: 0, perItem: addonPrices.map(() => 0) };
  const units = Math.min(addonPrices.length, BUNDLE_MAX_ADDON_UNITS);
  const percent = bundlePercent(terms, units);
  // The dearest `units` items get it.
  const order = addonPrices.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
  const perItem = addonPrices.map(() => 0);
  order.slice(0, units).forEach(({ p, i }) => {
    perItem[i] = bundleUnitDiscount(p, percent);
  });
  let total = perItem.reduce((s, d) => s + d, 0);
  if (terms.maxDiscountMinor > 0 && total > terms.maxDiscountMinor) {
    // Trim from the cheapest discounted item up, like the server.
    let over = total - terms.maxDiscountMinor;
    for (let k = units - 1; k >= 0 && over > 0; k--) {
      const i = order[k].i;
      const cut = Math.min(over, perItem[i]);
      perItem[i] -= cut;
      over -= cut;
    }
    total = terms.maxDiscountMinor;
  }
  return { percent, discountMinor: total, perItem };
}

/** Body of the cart quote from cart lines. */
export function bundleQuoteBody(
  lines: { productId: string; variantId?: string | null; quantity: number }[],
  promoDiscountMinor?: number | null
): BundleQuoteRequest {
  return {
    lines: lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? null, quantity: l.quantity })),
    promoDiscountMinor: promoDiscountMinor ?? 0,
  };
}

/** Same key the server uses for a line. */
export function bundleLineKey(productId: string, variantId?: string | null): string {
  return `${productId}::${variantId ?? ""}`;
}
