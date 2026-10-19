/**
 * «Вместе дешевле» (accessories with a discount next to a product), shared by the Mini App and the
 * website (docs/BUNDLES.md). Backend: com.maxsolch.shop.bundle (BundleService, BundleRanker,
 * BundlePricing), endpoints under /api/public/bundles (no sign-in).
 *
 * One discount per order: the bundle discount or the promo code, whichever is better for the
 * customer. The checkout prices the bundle again on the server, so the numbers here are for showing;
 * the cart asks the server (`quote`), the product page prices its own block with `bundleDiscount`.
 *
 * 2.0: the block is made of slots (one kind of accessory each: the best model, its other colours,
 * up to two alternatives); every offered item carries `capPercent` — the most its category may get
 * (from the margin), so an add-on gets min(tier, cap). «Собери сетап» offers other big items in a
 * matching colour. A share of visitors (`holdoutPercent`, by a stable id) does not see the
 * accessory block — the control group that shows what the block really adds.
 */
import type { Product } from "./types";

export interface BundleTerms {
  enabled: boolean;
  /** Percent for 1, 2, 3 add-ons (e.g. [5, 10, 15]); each add-on is further capped by its capPercent. */
  tiers: number[];
  /** An add-on costs at most this % of the main product. */
  maxAddonPricePercent: number;
  /** Per-order cap of the bundle discount in minor units; 0 = none. */
  maxDiscountMinor: number;
  /** Share of visitors in the control group (no accessory block), 0..50. */
  holdoutPercent?: number;
  setupEnabled?: boolean;
  /** Percent on the cheaper big items of «Собери сетап» (0 = no discount, still capped). */
  setupPercent?: number;
}

export type BundleReason = "COLOR_MATCH" | "HIT" | "LAST_ONE";
export type BundleAltKind = "COLOR_MATCH" | "CHEAPER" | "OTHER_BRAND";

/** Admin preview only. */
export interface BundleScore {
  total: number;
  pair: number;
  demand: number;
  match: number;
  price: number;
  stock: number;
  margin: number;
}

export interface BundleOfferItem {
  product: Product;
  /** The most percent this product gets (margin cap; in `setup` — the setup percent). */
  capPercent: number;
  reasons: BundleReason[];
  /** Kind of an alternative; null for the primary and colour variants. */
  kind: BundleAltKind | null;
  score?: BundleScore | null;
}

export interface BundleSlot {
  categoryId: string;
  categoryName: string | null;
  /** «Берут вместе в N % заказов»; 0 = too few orders to say. */
  pairPercent: number;
  /** The primary is the second-best model this time (measurement). */
  explore: boolean;
  primary: BundleOfferItem;
  /** Other colours of the same model. */
  colors: BundleOfferItem[];
  alternatives: BundleOfferItem[];
}

/** GET /api/public/bundles/product/{id} */
export interface BundleProductOffer {
  productId: string;
  terms: BundleTerms;
  /** Slot primaries (1.0 clients). */
  items: Product[];
  slots?: BundleSlot[];
  /** «Собери сетап»: other big items, shown to everyone. */
  setup?: BundleSlot[];
  /** Setup percent of the product itself (it gets it when a dearer setup item is taken). */
  anchorSetupPercent?: number;
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
  /** Units of the line that got the discount (at most 3 add-ons in the whole cart). */
  units: number;
  discountMinor: number;
  /** ADDON | SETUP */
  kind?: "ADDON" | "SETUP";
}

export type BundleDiscountKind = "BUNDLE" | "PROMO";

/** POST /api/public/bundles/quote response. */
export interface BundleQuote {
  subtotalMinor: number;
  bundleDiscountMinor: number;
  bundlePercent: number;
  /** Discounted lines with their share of the bundle discount. */
  lines: BundleQuoteLine[];
  /** The discount the order will get — only one of the two. */
  discountKind: BundleDiscountKind | null;
  discountMinor: number;
  totalMinor: number;
  /** Accessories for what is in the cart (not already in it). */
  suggestions: Product[];
  terms: BundleTerms;
  /** The same with caps and reasons (2.0). */
  offers?: BundleOfferItem[];
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

/** An add-on for `bundleDiscount`: a bare price is uncapped (1.0). */
export type BundleAddon = number | { priceMinor: number; capPercent?: number | null };

const addonPrice = (a: BundleAddon) => (typeof a === "number" ? a : a.priceMinor);
const addonCap = (a: BundleAddon) =>
  typeof a === "number" || a.capPercent == null ? 100 : Math.max(0, Math.min(100, a.capPercent));

/**
 * Bundle discount for one unit of each of `addons` next to the main product (product page): items
 * with cap 0 are no add-ons, the dearest three set the tier, each gets min(tier, its cap), then the
 * per-order cap. Mirrors BundlePricing.compute for a cart of «main product + these accessories».
 * `percent` — the largest percent an item got.
 */
export function bundleDiscount(
  terms: BundleTerms,
  addons: BundleAddon[],
): { percent: number; discountMinor: number; perItem: number[]; percents: number[] } {
  const zero = { percent: 0, discountMinor: 0, perItem: addons.map(() => 0), percents: addons.map(() => 0) };
  if (!terms.enabled || addons.length === 0) return zero;
  const eligible = addons.map((a, i) => ({ p: addonPrice(a), cap: addonCap(a), i })).filter((x) => x.cap > 0 && x.p > 0);
  if (eligible.length === 0) return zero;
  const units = Math.min(eligible.length, BUNDLE_MAX_ADDON_UNITS);
  const tier = bundlePercent(terms, units);
  // The dearest `units` items get it.
  const order = eligible.sort((a, b) => b.p - a.p).slice(0, units);
  const perItem = addons.map(() => 0);
  const percents = addons.map(() => 0);
  let percent = 0;
  for (const { p, cap, i } of order) {
    const pct = Math.min(tier, cap);
    perItem[i] = bundleUnitDiscount(p, pct);
    if (perItem[i] > 0) {
      percents[i] = pct;
      percent = Math.max(percent, pct);
    }
  }
  let total = perItem.reduce((s, d) => s + d, 0);
  if (terms.maxDiscountMinor > 0 && total > terms.maxDiscountMinor) {
    // Trim from the cheapest discounted item up, like the server.
    let over = total - terms.maxDiscountMinor;
    for (let k = order.length - 1; k >= 0 && over > 0; k--) {
      const i = order[k].i;
      const cut = Math.min(over, perItem[i]);
      perItem[i] -= cut;
      over -= cut;
    }
    total = terms.maxDiscountMinor;
  }
  return { percent, discountMinor: total, perItem, percents };
}

/**
 * «Собери сетап»: every big item but the dearest gets its own setup percent (`capPercent` — already
 * min(setupPercent, margin cap)) on one unit.
 */
export function setupDiscount(items: { priceMinor: number; capPercent: number }[]): { discountMinor: number; perItem: number[] } {
  const perItem = items.map(() => 0);
  if (items.length < 2) return { discountMinor: 0, perItem };
  let dearest = 0;
  items.forEach((it, i) => {
    if (it.priceMinor > items[dearest].priceMinor) dearest = i;
  });
  items.forEach((it, i) => {
    if (i !== dearest) perItem[i] = bundleUnitDiscount(it.priceMinor, Math.max(0, it.capPercent));
  });
  return { discountMinor: perItem.reduce((s, d) => s + d, 0), perItem };
}

/** The best percent an offer can reach: the top tier capped by the most generous item. */
export function bundleMaxPercent(terms: BundleTerms, caps: number[]): number {
  if (caps.length === 0) return 0;
  const top = bundlePercent(terms, Math.min(caps.length, BUNDLE_MAX_ADDON_UNITS));
  return Math.min(top, Math.max(...caps));
}

/**
 * Group of a visitor: "H" (control, no accessory block) for `holdoutPercent` % of stable ids, else
 * "B". Same id → same group on every page and visit (FNV-1a hash, not random).
 */
export function bundleGroup(stableId: string | number | null | undefined, holdoutPercent: number | undefined): "B" | "H" {
  if (!holdoutPercent || holdoutPercent <= 0 || stableId == null || stableId === "") return "B";
  const s = `bundle:${stableId}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100 < holdoutPercent ? "H" : "B";
}

/** Primary first, then the other colours — the swatches of a slot. */
export function slotColorItems(slot: BundleSlot): BundleOfferItem[] {
  return [slot.primary, ...slot.colors];
}

/** First colour key of a product (specs.color), for a swatch. */
export function productColor(p: Product): string | null {
  const v = (p as { specs?: Record<string, unknown> | null }).specs?.color;
  if (Array.isArray(v)) return (v[0] as string) ?? null;
  return typeof v === "string" ? v : null;
}

/** CSS colour of a swatch (specs.color keys). */
export const BUNDLE_SWATCH: Record<string, string> = {
  black: "#111114",
  white: "#f4f4f2",
  gray: "#8a8a90",
  silver: "#c9cacf",
  purple: "#8b5cf6",
  pink: "#f9a8d4",
  orange: "#fb923c",
  red: "#ef4444",
  green: "#22c55e",
  light_blue: "#7dd3fc",
  blue: "#3b82f6",
  multicolor: "conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)",
  beige: "#e7d3b1",
  brown: "#8b5e3c",
  yellow: "#facc15",
};

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
