/**
 * Gift case (a CS-style loot case for the order sum), shared by the Mini App and the website.
 * Backend: V58, BundleService (draw at checkout), GiftCaseService, endpoints
 *   POST /api/me/orders/{id}/gift-case/open → GiftCaseOpen
 *   quote.gift.kind === "CASE" → quote.gift.caseItems (prizes with chances) for the cart.
 *
 * The prize is decided by the SERVER at checkout; the reel here is only the show: a long strip of
 * random prizes (by their chances) with the real prize planted near the end, where the reel stops.
 */

export type CaseRarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY" | "GOLD";

export interface CaseItem {
  productId: string;
  title: string;
  imageUrl: string | null;
  priceMinor: number;
  rarity: CaseRarity;
  /** Chance among the prizes in stock, % (one decimal). */
  chancePercent: number;
}

export interface GiftCaseOpen {
  status: "OPENED";
  won: CaseItem;
  /** Every prize of the case (for the reel and the «what can drop» list). */
  reel: CaseItem[];
}

export type GiftCaseStatus = "SEALED" | "OPENED";

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
