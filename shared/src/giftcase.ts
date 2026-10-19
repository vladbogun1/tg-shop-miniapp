/**
 * The gift for the order sum and the gift cases (CS-style loot cases of three tiers — bronze, silver,
 * gold), shared by the Mini App and the website (docs/GIFT-CASE.md). Backend: package
 * com.maxsolch.shop.gift (V57), endpoints
 *   GET  /api/public/gift → GiftResponse (tiers with thresholds and prizes, or one product)
 *   POST /api/me/orders/{id}/gift-case/open → GiftCaseOpen
 *   POST /api/me/orders/{id}/gift-case/swap → GiftCaseOpen (the prize swapped for a code)
 * The clients count «add N more» themselves with {@link giftProgress} (the cart total after the
 * discount, or the product price on the product page); the checkout decides it again on the server.
 *
 * The prize is decided by the SERVER (at checkout, or when an admin gives a case); the reel here is
 * only the show: a long strip of random prizes of the tier with the real prize planted near the end,
 * where the reel stops. The client never picks or computes the prize, and never sees the chances.
 *
 * Before checkout the customer chooses: the tier's guaranteed discount on this order, or the case
 * (`giftChoice` of the order request). A product prize similar to what they bought may be swapped for
 * a discount code (`swap`). A discount prize is a personal code on the next order.
 *
 * Rules (server-enforced): the case opens only once the order is paid (`openable`), and exactly once —
 * 400 GIFT_CASE_UNPAID / GIFT_CASE_ALREADY_OPENED otherwise; no replays.
 */

import type { Product } from "./types";

export type CaseRarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY" | "GOLD";
export type CaseTier = "BRONZE" | "SILVER" | "GOLD";
export type CasePrizeKind = "PRODUCT" | "DISCOUNT";

export interface CaseItem {
  /** Stable key: «p<productId>» / «d<id>». */
  key: string;
  kind: CasePrizeKind;
  productId: string | null;
  /** Product title (PRODUCT); null for a discount — show it with {@link caseDiscountText}. */
  title: string | null;
  imageUrl: string | null;
  priceMinor: number;
  rarity: CaseRarity;
  /** DISCOUNT: % off the next order (0 → see discountAmountMinor). */
  discountPercent: number;
  /** DISCOUNT: fixed amount off the next order. */
  discountAmountMinor: number;
}

/** A case tier as the storefront sees it. */
export interface GiftTierInfo {
  tier: CaseTier;
  thresholdMinor: number;
  /** «Guaranteed discount instead of the case», %; 0 = no choice, always the case. */
  guaranteedPercent: number;
  /** Cap of the guaranteed discount; 0 = no cap. */
  guaranteedMaxMinor: number;
  /** A similar prize may be swapped for a discount. */
  swap: boolean;
  /** The swap gives this % of the prize's price as a code (absent from an older backend). */
  swapPercent?: number;
  /** Days a code from this tier's case is valid (absent from an older backend). */
  promoValidDays?: number;
  /** What can drop, most common first (no chances — they are never shown). */
  prizes: CaseItem[];
}

/** What the shop gives for the order sum now (GET /api/public/gift → { gift }). */
export interface GiftInfo {
  /** The cheapest way to get anything (the bronze tier, or the single product). */
  thresholdMinor: number;
  /** PRODUCT: one known gift; CASE: a case of the reached tier. */
  kind: "PRODUCT" | "CASE";
  /** The gift (kind PRODUCT); null for a case. */
  product: Product | null;
  /** Case tiers with prizes, cheapest first (kind CASE). */
  tiers: GiftTierInfo[];
}

/** GET /api/public/gift; gift null = off or nothing to give. */
export interface GiftResponse {
  gift: GiftInfo | null;
}

/** Progress to the gift for an amount (the cart total after the discount / a product price). */
export interface GiftProgress extends GiftInfo {
  /** The dearest tier the amount reaches (CASE); null = none yet. */
  tier: GiftTierInfo | null;
  /** The next tier up (CASE); null = the dearest one is reached. */
  next: GiftTierInfo | null;
  /** Still to add to the next step: the first tier / the product (not reached), or the next tier up. */
  remainingMinor: number;
  /** A gift is earned: a tier (CASE) or the product. */
  reached: boolean;
  /** Share of the way to the next step, 0..1 (1 when everything is reached). */
  share: number;
}

/** {@link GiftProgress} of `totalMinor` (like the server: reached when total ≥ threshold and > 0); null without a gift. */
export function giftProgress(info: GiftInfo | null | undefined, totalMinor: number): GiftProgress | null {
  if (!info) return null;
  const total = Math.max(0, Math.round(totalMinor || 0));
  if (info.kind === "CASE") {
    const tiers = [...(info.tiers ?? [])].sort((a, b) => a.thresholdMinor - b.thresholdMinor);
    if (!tiers.length) return null;
    const reachedTiers = total > 0 ? tiers.filter((t) => total >= t.thresholdMinor) : [];
    const tier = reachedTiers.length ? reachedTiers[reachedTiers.length - 1] : null;
    const next = tiers.find((t) => t.thresholdMinor > total || total <= 0) ?? null;
    const from = tier?.thresholdMinor ?? 0;
    const remainingMinor = next ? Math.max(0, next.thresholdMinor - total) : 0;
    const span = next ? next.thresholdMinor - from : 1;
    const share = next ? Math.min(1, Math.max(0, (total - from) / Math.max(1, span))) : 1;
    return { ...info, tier, next, remainingMinor, reached: !!tier, share };
  }
  const remainingMinor = Math.max(0, info.thresholdMinor - total);
  const reached = remainingMinor === 0 && total > 0;
  const share = info.thresholdMinor > 0 ? Math.min(1, Math.max(0, total / info.thresholdMinor)) : 1;
  return { ...info, tier: null, next: null, remainingMinor, reached, share };
}

/** The tier's guaranteed discount for an order total — whole hryvnias, within the cap (the server's rule). */
export function guaranteedDiscountMinor(tier: GiftTierInfo | null | undefined, totalMinor: number): number {
  if (!tier || tier.guaranteedPercent <= 0 || totalMinor <= 0) return 0;
  let d = Math.floor((totalMinor * Math.min(100, tier.guaranteedPercent)) / 100 / 100) * 100;
  if (tier.guaranteedMaxMinor > 0) d = Math.min(d, tier.guaranteedMaxMinor);
  return Math.max(0, Math.min(d, totalMinor));
}

/** The customer's pre-choice at checkout (sent as `giftChoice` with the order). */
export type GiftChoice = "CASE" | "DISCOUNT";

/** A personal code the case gave (a discount prize, or a swapped prize). */
export interface CasePromo {
  code: string;
  percent: number;
  amountMinor: number;
  expiresAt: string | null;
  /** Used (or switched off). */
  used: boolean;
}

/** Swap of a product prize similar to what the customer bought. */
export interface CaseSwap {
  available: boolean;
  /** What the swap gives (a fixed-amount code). */
  amountMinor: number;
  /** Done: the prize left the order. */
  swappedAt: string | null;
}

export interface GiftCaseOpen {
  status: "OPENED";
  tier: CaseTier;
  won: CaseItem;
  /** The tier's prizes (for the reel). */
  reel: CaseItem[];
  /** The code of a discount prize / of a swap. */
  promo: CasePromo | null;
  swap: CaseSwap | null;
}

export type GiftCaseStatus = "SEALED" | "OPENED";

/** The gift of an order (OrderDetail.gift): the tier, the guaranteed discount or the case. */
export interface OrderGift {
  tier: CaseTier | null;
  /** The customer took the guaranteed discount instead of the case (part of discountMinor). */
  guaranteedDiscountMinor: number;
  caseStatus: GiftCaseStatus | null;
  openable: boolean;
  /** The prize — for the customer only once opened. */
  prize: CaseItem | null;
  promo: CasePromo | null;
  swap: CaseSwap | null;
}

/** Error codes of POST …/gift-case/open the apps handle gracefully (close the screen, refetch). */
export type GiftCaseOpenErrorCode = "GIFT_CASE_UNPAID" | "GIFT_CASE_ALREADY_OPENED";

/** The {@link GiftCaseOpenErrorCode} of a failed open call (an ApiError with `code`), else null. */
export function giftCaseOpenErrorCode(e: unknown): GiftCaseOpenErrorCode | null {
  const code = e && typeof e === "object" && "code" in e ? (e as { code?: unknown }).code : undefined;
  return code === "GIFT_CASE_UNPAID" || code === "GIFT_CASE_ALREADY_OPENED" ? code : null;
}

/**
 * «−10%» / «−300 ₴» for a discount prize or a code; `money` formats minor units in the app's style.
 */
export function caseDiscountText(
  d: { discountPercent?: number; discountAmountMinor?: number; percent?: number; amountMinor?: number },
  money: (minor: number) => string
): string {
  const pc = d.discountPercent ?? d.percent ?? 0;
  if (pc > 0) return `−${pc}%`;
  return `−${money(d.discountAmountMinor ?? d.amountMinor ?? 0)}`;
}

/** Path of the published promotion rules on the website (without the locale prefix). */
export const CASE_RULES_PATH = "/case-rules";

/** Where the website lives, for the Mini App's link to the rules. */
export const CASE_RULES_ORIGIN = "https://chisetup.com.ua";

/** Absolute URL of the promotion rules in `locale` (Ukrainian has no prefix, like every site page). */
export function caseRulesUrl(locale: string, origin: string = CASE_RULES_ORIGIN): string {
  return `${origin.replace(/\/$/, "")}${locale === "uk" ? "" : `/${locale}`}${CASE_RULES_PATH}`;
}

/** CS colours: Mil-Spec blue-grey → Restricted blue → Classified purple → Covert red → gold. */
export const CASE_RARITY_COLOR: Record<CaseRarity, string> = {
  COMMON: "#8a9bb3",
  RARE: "#4b69ff",
  EPIC: "#a64dff",
  LEGENDARY: "#eb4b4b",
  GOLD: "#ffb627",
};

/** Order from the most common to the rarest. */
export const CASE_RARITY_ORDER: CaseRarity[] = ["COMMON", "RARE", "EPIC", "LEGENDARY", "GOLD"];

/** Cheapest tier first. */
export const CASE_TIER_ORDER: CaseTier[] = ["BRONZE", "SILVER", "GOLD"];

/**
 * Metal of a tier for the case UI: `ga` the accent (glow, marker, outlines), `ga2` its light tone
 * (sparks, eyebrow), `gb1`→`gb2` the button/badge gradient and `ink` the text on it.
 */
export const CASE_TIER_METAL: Record<CaseTier, { ga: string; ga2: string; gb1: string; gb2: string; ink: string }> = {
  BRONZE: { ga: "#d9773a", ga2: "#f3ac78", gb1: "#f4b07c", gb2: "#9c5326", ink: "#1a0d05" },
  SILVER: { ga: "#aebfd8", ga2: "#eef3fa", gb1: "#f4f7fc", gb2: "#8996ab", ink: "#0d1118" },
  GOLD: { ga: "#ffb81c", ga2: "#ffe27a", gb1: "#ffe68a", gb2: "#d4930a", ink: "#1a1100" },
};

export function caseTierRank(t: CaseTier | string | null | undefined): number {
  const i = CASE_TIER_ORDER.indexOf(t as CaseTier);
  return i < 0 ? 0 : i;
}

export function caseRarityRank(r: CaseRarity | string | null | undefined): number {
  const i = CASE_RARITY_ORDER.indexOf(r as CaseRarity);
  return i < 0 ? 0 : i;
}

/** Rarest first, then the dearest. */
export function sortCasePrizes(items: CaseItem[]): CaseItem[] {
  return [...items].sort(
    (a, b) =>
      caseRarityRank(b.rarity) - caseRarityRank(a.rarity) ||
      (b.priceMinor || b.discountAmountMinor || 0) - (a.priceMinor || a.discountAmountMinor || 0)
  );
}

/** The rarest product prize (ties: the dearest) — the «можна вибити: …» teaser; null for an empty list. */
export function rarestCasePrize(items: CaseItem[] | null | undefined): CaseItem | null {
  if (!items?.length) return null;
  const products = items.filter((p) => p.kind === "PRODUCT" && p.title);
  return sortCasePrizes(products.length ? products : items)[0] ?? null;
}

/** Tiles in the reel and where the prize sits (the reel scrolls left until that tile is centred). */
export const CASE_REEL_LENGTH = 56;
export const CASE_REEL_WIN_INDEX = 48;

/** How often a rarity shows up in the reel (a show, not the real chances, which the client never has). */
const REEL_WEIGHT: Record<CaseRarity, number> = { COMMON: 40, RARE: 24, EPIC: 13, LEGENDARY: 7, GOLD: 4 };

/**
 * The reel: `length` tiles drawn from `prizes` (common rarities more often), the real prize at
 * `winIndex`. Rare prizes appear right next to the stop (the classic «so close» moment), so the show
 * is exciting even when the prize is common.
 */
export function buildCaseReel(
  prizes: CaseItem[],
  won: CaseItem,
  opts: { length?: number; winIndex?: number; random?: () => number } = {}
): CaseItem[] {
  const length = opts.length ?? CASE_REEL_LENGTH;
  const winIndex = Math.min(opts.winIndex ?? CASE_REEL_WIN_INDEX, length - 1);
  const rnd = opts.random ?? Math.random;
  const pool = prizes.length ? prizes : [won];
  const weights = pool.map((p) => REEL_WEIGHT[p.rarity] ?? 10);
  const total = weights.reduce((s, w) => s + w, 0);
  const pick = () => {
    let r = rnd() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r < 0) return pool[i];
    }
    return pool[pool.length - 1];
  };
  const reel = Array.from({ length }, pick);
  reel[winIndex] = won;
  // A near miss: the rarest prize right after the stop, if the win is not already the rarest.
  const rarest = sortCasePrizes(pool)[0];
  if (rarest && rarest.key !== won.key && winIndex + 1 < length && rnd() < 0.6) {
    reel[winIndex + 1] = rarest;
  }
  return reel;
}

/**
 * Final offset (px) of the reel so the win tile stops under the centre marker — not dead centre,
 * a random spot inside the tile, like CS (`jitter` 0..1 of the tile width, kept off the edges).
 */
export function caseReelOffset(opts: {
  tileWidth: number;
  gap: number;
  viewportWidth: number;
  winIndex?: number;
  jitter?: number;
}): number {
  const winIndex = opts.winIndex ?? CASE_REEL_WIN_INDEX;
  const step = opts.tileWidth + opts.gap;
  const jitter = Math.min(0.85, Math.max(0.15, opts.jitter ?? Math.random()));
  const tileStart = winIndex * step;
  return tileStart + opts.tileWidth * jitter - opts.viewportWidth / 2;
}
