/**
 * The gift for the order sum and the gift case (a CS-style loot case), shared by the Mini App and
 * the website (docs/GIFT-CASE.md). Backend: package com.maxsolch.shop.gift (V58), endpoints
 *   GET  /api/public/gift → GiftResponse (threshold, one product or the case prizes with chances)
 *   POST /api/me/orders/{id}/gift-case/open → GiftCaseOpen
 * The clients count «add N more» themselves with {@link giftProgress} (the cart total after the
 * discount, or the product price on the product page); the checkout decides it again on the server.
 *
 * The prize is decided by the SERVER (at checkout, or when an admin gives a case); the reel here is
 * only the show: a long strip of random prizes (by their chances) with the real prize planted near
 * the end, where the reel stops. The client never picks or computes the prize.
 *
 * Rules (server-enforced): the case opens only once the order is paid (`giftCaseOpenable`), and
 * exactly once — 400 GIFT_CASE_UNPAID / GIFT_CASE_ALREADY_OPENED otherwise; no replays.
 */

import type { Product } from "./types";

export type CaseRarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY" | "GOLD";

export interface CaseItem {
  productId: string;
  title: string;
  imageUrl: string | null;
  priceMinor: number;
  rarity: CaseRarity;
  /** Chance among the prizes in stock, % (up to 4 decimals: 0.0011). Show it with {@link formatCaseChance}. */
  chancePercent: number;
}

/** What the shop gives for the order sum now (GET /api/public/gift → { gift }). */
export interface GiftInfo {
  thresholdMinor: number;
  /** PRODUCT: one known gift; CASE: a random prize from caseItems. */
  kind: "PRODUCT" | "CASE";
  /** The gift (kind PRODUCT); null for a case. */
  product: Product | null;
  /** Prizes of the case in stock with chances, most common first (kind CASE). */
  caseItems: CaseItem[];
}

/** GET /api/public/gift; gift null = off or nothing in stock. */
export interface GiftResponse {
  gift: GiftInfo | null;
}

/** Progress to the gift for an amount (the cart total after the discount / a product price). */
export interface GiftProgress extends GiftInfo {
  /** Still to add to get the gift; 0 = reached. */
  remainingMinor: number;
  reached: boolean;
}

/** {@link GiftProgress} of `totalMinor` (like the server: reached when total ≥ threshold and > 0); null without a gift. */
export function giftProgress(info: GiftInfo | null | undefined, totalMinor: number): GiftProgress | null {
  if (!info) return null;
  const total = Math.max(0, Math.round(totalMinor || 0));
  const remainingMinor = Math.max(0, info.thresholdMinor - total);
  return { ...info, remainingMinor, reached: remainingMinor === 0 && total > 0 };
}

export interface GiftCaseOpen {
  status: "OPENED";
  won: CaseItem;
  /** Every prize of the case (for the reel and the «what can drop» list). */
  reel: CaseItem[];
}

export type GiftCaseStatus = "SEALED" | "OPENED";

/** Error codes of POST …/gift-case/open the apps handle gracefully (close the screen, refetch). */
export type GiftCaseOpenErrorCode = "GIFT_CASE_UNPAID" | "GIFT_CASE_ALREADY_OPENED";

/** The {@link GiftCaseOpenErrorCode} of a failed open call (an ApiError with `code`), else null. */
export function giftCaseOpenErrorCode(e: unknown): GiftCaseOpenErrorCode | null {
  const code = e && typeof e === "object" && "code" in e ? (e as { code?: unknown }).code : undefined;
  return code === "GIFT_CASE_UNPAID" || code === "GIFT_CASE_ALREADY_OPENED" ? code : null;
}

/**
 * A prize chance for people: «24,6%», «3%», «0,45%», «0,001%». ≥ 1 % → at most one decimal; below
 * 1 % → two significant digits (never «0%» for a positive chance). The decimal separator follows
 * `locale` («,» for uk/ru, «.» for en; default «,»). Not positive / not a number → «—».
 */
export function formatCaseChance(p: number, locale?: string): string {
  if (!Number.isFinite(p) || p <= 0) return "—";
  let s: string;
  if (p >= 1) {
    s = String(Math.round(p * 10) / 10);
  } else {
    // two significant digits, at most 4 decimals (the server's precision), trailing zeros dropped
    const decimals = Math.min(4, Math.max(1, 1 - Math.floor(Math.log10(p))));
    s = String(Number(p.toFixed(decimals)));
    if (Number(s) <= 0) s = "0.0001";
  }
  const sep = locale && /^en/i.test(locale) ? "." : ",";
  return `${s.replace(".", sep)}%`;
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

export function caseRarityRank(r: CaseRarity | string | null | undefined): number {
  const i = CASE_RARITY_ORDER.indexOf(r as CaseRarity);
  return i < 0 ? 0 : i;
}

/** The rarest prize (ties: the smallest chance) — the «можна вибити: …» teaser; null for an empty list. */
export function rarestCasePrize(items: CaseItem[] | null | undefined): CaseItem | null {
  if (!items?.length) return null;
  return [...items].sort(
    (a, b) => caseRarityRank(b.rarity) - caseRarityRank(a.rarity) || (a.chancePercent || 0) - (b.chancePercent || 0)
  )[0];
}

/** Tiles in the reel and where the prize sits (the reel scrolls left until that tile is centred). */
export const CASE_REEL_LENGTH = 56;
export const CASE_REEL_WIN_INDEX = 48;

/**
 * The reel: `length` tiles drawn by chance from `prizes`, the real prize at `winIndex`. Rare prizes
 * are sprinkled in a little more often than their real chance (and right next to the stop, the
 * classic «so close» moment), so the show is exciting even when the prize is common.
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
  // Show weights: real chance, but at least 3 % for anything rarer than common.
  const weights = pool.map((p) => Math.max(p.chancePercent || 0, caseRarityRank(p.rarity) > 0 ? 3 : 1));
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
  const rarest = [...pool].sort((a, b) => caseRarityRank(b.rarity) - caseRarityRank(a.rarity))[0];
  if (rarest && rarest.productId !== won.productId && winIndex + 1 < length && rnd() < 0.6) {
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
