/**
 * The case builder's draft (docs/GIFT-CASE.md, «Конструктор»): the tier's prizes edited locally and
 * published at once (PUT /api/admin/gift/tiers/{tier}/items). Chances as set are kept summing to 100 % over the
 * prizes in the case, products out of stock too: changing one chance (or a rarity's share) rescales the others
 * in proportion. A product out of stock gives its chance to the discounts until it is back ({@link realChances}).
 *
 * Money of the summary: no cost price in the shop, so a product prize costs price × (1 − margin) and a
 * discount prize its full amount (a percent one — that percent of the threshold).
 */
import { CASE_RARITY_ORDER, type CaseRarity, type CaseTier } from "@shop/core/giftcase";
import type { CaseDraftItem, CaseItemAdmin, DraftItem, GiftTierAdmin } from "./types";
import { formatNumber, toMinor } from "@shop/core/money";
import { guaranteedDiscountMinor, percentOf, percentToFraction, ratioToPercent } from "./units";

/** Sum of the weights = 100 % (weight units per 1 % — the server's GiftService.CASE_WEIGHT_PER_PERCENT). */
export const WEIGHT_PER_PERCENT = 10_000;
export const TOTAL_WEIGHT = 100 * WEIGHT_PER_PERCENT;

/** Starting chance (%) of a prize added by hand, by rarity. */
export const DEFAULT_CHANCE: Record<CaseRarity, number> = { COMMON: 15, RARE: 6, EPIC: 2, LEGENDARY: 0.5, GOLD: 0.05 };

/** A prize of the board. `key` is local; `locked` = kept by «Автособрать». */
export interface Row extends DraftItem {
  key: string;
  locked?: boolean;
}

let seq = 0;
export const newKey = () => `n${++seq}`;

export function fromServer(it: CaseItemAdmin): Row {
  return {
    key: `s${it.id}`,
    id: it.id,
    kind: it.kind,
    productId: it.productId,
    discountPercent: it.discountPercent,
    discountUah: it.discountUah,
    rarity: it.rarity,
    weight: it.weight,
    active: it.active,
    title: it.title,
    imageUrl: it.imageUrl,
    priceMinor: it.priceMinor,
    stock: it.stock,
    productActive: it.productActive,
    category: null,
  };
}

export function fromDraftItem(x: DraftItem, locked = false): Row {
  return { ...x, key: x.id != null ? `s${x.id}` : newKey(), locked };
}

export function toDraft(rows: Row[]): CaseDraftItem[] {
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    productId: r.productId,
    discountPercent: r.discountPercent,
    discountUah: r.discountUah,
    rarity: r.rarity,
    weight: r.weight,
    active: r.active,
  }));
}

/**
 * In the case: switched on, chance > 0, a discount with a value / a product. Its chance counts towards the 100 %
 * even while the product is out of stock — then the chance goes to the discounts (the server's CasePrizeRules.inPool).
 */
export function inPool(r: Row): boolean {
  if (!r.active || r.weight <= 0) return false;
  return r.kind === "DISCOUNT" ? r.discountPercent > 0 || r.discountUah > 0 : r.productId != null;
}

/** Can drop now: in the case and, for a product, in stock and visible. */
export function canDrop(r: Row): boolean {
  return inPool(r) && (r.kind === "DISCOUNT" || (r.stock > 0 && r.productActive));
}

/** Sum of the weights of the prizes in the case (100 % as set). */
export function poolTotal(rows: Row[]): number {
  return rows.reduce((s, r) => s + (inPool(r) ? r.weight : 0), 0);
}

/**
 * Real chance of every prize, % — as the server draws (GiftCaseDraw.liveWeights): a product in stock keeps its
 * chance as set, a product out of stock gives it to the discounts in their ratio. Without discounts it goes
 * to the products left (the old rule).
 */
export function realChances(rows: Row[]): Map<string, number> {
  const out = new Map<string, number>();
  const pool = rows.filter(inPool);
  const total = poolTotal(rows);
  const discounts = pool.filter((r) => r.kind === "DISCOUNT").reduce((s, r) => s + r.weight, 0);
  const live = pool.filter(canDrop).reduce((s, r) => s + r.weight, 0);
  for (const r of rows) {
    let c = 0;
    if (canDrop(r) && discounts > 0) {
      c = r.kind === "DISCOUNT" ? ratioToPercent(r.weight * (total - live + discounts), discounts * total) : ratioToPercent(r.weight, total);
    } else if (canDrop(r) && live > 0) {
      c = ratioToPercent(r.weight, live);
    }
    out.set(r.key, c);
  }
  return out;
}

/** The prizes in the case except `keep` are rescaled so their sum is 100 %. */
export function normalize(rows: Row[], keep: Set<string> = new Set()): Row[] {
  const live = rows.filter(inPool);
  const fixed = live.filter((r) => keep.has(r.key)).reduce((s, r) => s + r.weight, 0);
  const free = live.filter((r) => !keep.has(r.key));
  if (free.length === 0) return rows;
  const freeSum = free.reduce((s, r) => s + r.weight, 0);
  const target = Math.max(0, TOTAL_WEIGHT - fixed);
  const next = new Map<string, number>();
  for (const r of free) next.set(r.key, Math.round(freeSum > 0 ? (r.weight * target) / freeSum : target / free.length));
  // Rounding leftovers go to the biggest one.
  const sum = [...next.values()].reduce((s, w) => s + w, 0);
  const biggest = free.reduce((a, b) => ((next.get(b.key) ?? 0) > (next.get(a.key) ?? 0) ? b : a));
  next.set(biggest.key, Math.max(0, (next.get(biggest.key) ?? 0) + target - sum));
  return rows.map((r) => (next.has(r.key) ? { ...r, weight: next.get(r.key)! } : r));
}

/** One prize's chance → `percent`; the others share the rest in proportion. */
export function setChance(rows: Row[], key: string, percent: number): Row[] {
  const w = Math.round(Math.min(100, Math.max(0, percent)) * WEIGHT_PER_PERCENT);
  const next = rows.map((r) => (r.key === key ? { ...r, weight: w } : r));
  const row = next.find((r) => r.key === key);
  return row && inPool(row) ? normalize(next, new Set([key])) : next;
}

/** A rarity's total chance → `percent` (its prizes keep their proportions); the other rarities share the rest. */
export function setLaneShare(rows: Row[], rarity: CaseRarity, percent: number): Row[] {
  const lane = rows.filter((r) => r.rarity === rarity && inPool(r));
  if (lane.length === 0) return rows;
  const target = Math.round(Math.min(100, Math.max(0, percent)) * WEIGHT_PER_PERCENT);
  const sum = lane.reduce((s, r) => s + r.weight, 0);
  const keys = new Set(lane.map((r) => r.key));
  const next = rows.map((r) =>
    keys.has(r.key) ? { ...r, weight: Math.round(sum > 0 ? (r.weight * target) / sum : target / lane.length) } : r
  );
  return normalize(next, keys);
}

/** A new prize with the default chance of its rarity; the others make room. */
export function addRow(rows: Row[], row: Row): Row[] {
  const next = [...rows, { ...row, weight: Math.round(DEFAULT_CHANCE[row.rarity] * WEIGHT_PER_PERCENT) }];
  return inPool(next[next.length - 1]) ? normalize(next, new Set([row.key])) : next;
}

export function removeRow(rows: Row[], key: string): Row[] {
  return normalize(rows.filter((r) => r.key !== key));
}

/** Discount value (₴) a new discount prize starts with, by rarity: a share of the threshold, by 50 ₴. */
export function defaultDiscountUah(rarity: CaseRarity, thresholdUah: number): number {
  const share: Record<CaseRarity, number> = { COMMON: 0.05, RARE: 0.15, EPIC: 0.3, LEGENDARY: 0.6, GOLD: 1 };
  return Math.max(50, Math.round((thresholdUah * share[rarity]) / 50) * 50);
}

/** What a prize costs the shop, kopecks. */
export function costMinor(r: Row, thresholdMinor: number, marginPercent: number): number {
  if (r.kind === "DISCOUNT") return r.discountPercent > 0 ? percentOf(thresholdMinor, r.discountPercent) : toMinor(r.discountUah);
  return r.priceMinor * (1 - percentToFraction(marginPercent));
}

export interface Summary {
  total: number;
  /** key → chance as set, % (the prizes in the case sum to 100). */
  setting: Map<string, number>;
  /** key → real chance now, % (what the checkout and «Тест кейса» draw). */
  chance: Map<string, number>;
  /** Rarity → its chance as set, %. */
  share: Record<CaseRarity, number>;
  /** Chance as set of the products out of stock (or hidden), % — the discounts drop that much more now. */
  soldOutShare: number;
  /** The case has discounts: a sold-out product's chance goes to them (else to the products left). */
  hasDiscounts: boolean;
  /** Prizes that can drop now. */
  live: number;
  avgPrizeMinor: number;
  avgCostMinor: number;
  marginMinor: number;
  /** avgCost / margin, %. */
  costShare: number;
  /** The guaranteed discount on an order at the threshold, kopecks (0 = none). */
  guaranteedMinor: number;
  monthly: number;
  /** key → expected drops a month. */
  perMonth: Map<string, number>;
  /** Prizes expected to drop more often a month than there are in stock. */
  shortStock: Row[];
}

/** The guaranteed discount on an order at the threshold, kopecks (0 = none). */
function guaranteedOf(t: GiftTierAdmin | null, thresholdMinor: number): number {
  return t ? guaranteedDiscountMinor(thresholdMinor, t.guaranteedPercent, t.guaranteedMaxUah) : 0;
}

/** Chances as set: by prize, by rarity, and of the products that can't drop now. */
function settings(rows: Row[]): Pick<Summary, "total" | "setting" | "share" | "soldOutShare" | "hasDiscounts"> {
  const total = poolTotal(rows);
  const setting = new Map<string, number>();
  const share = Object.fromEntries(CASE_RARITY_ORDER.map((r) => [r, 0])) as Record<CaseRarity, number>;
  let soldOutShare = 0;
  for (const r of rows) {
    const set = inPool(r) && total > 0 ? ratioToPercent(r.weight, total) : 0;
    setting.set(r.key, set);
    share[r.rarity] += set;
    if (set > 0 && !canDrop(r)) soldOutShare += set;
  }
  const hasDiscounts = rows.some((r) => r.kind === "DISCOUNT" && canDrop(r));
  return { total, setting, share, soldOutShare, hasDiscounts };
}

export function summarize(rows: Row[], t: GiftTierAdmin | null): Summary {
  const T = toMinor(t?.thresholdUah ?? 0);
  const margin = t?.marginPercent ?? 15;
  const { total, setting, share, soldOutShare, hasDiscounts } = settings(rows);
  const chance = realChances(rows);
  let avgPrize = 0;
  let avgCost = 0;
  let live = 0;
  const monthly = t?.monthlyOrders ?? 0;
  const perMonth = new Map<string, number>();
  const shortStock: Row[] = [];
  for (const r of rows) {
    const c = chance.get(r.key) ?? 0;
    if (c <= 0) continue;
    live++;
    if (r.kind === "PRODUCT") avgPrize += percentToFraction(c) * r.priceMinor;
    avgCost += percentToFraction(c) * costMinor(r, T, margin);
    const pm = percentOf(monthly, c);
    perMonth.set(r.key, pm);
    if (r.kind === "PRODUCT" && pm > r.stock) shortStock.push(r);
  }
  const marginMinor = percentOf(T, margin);
  return {
    total,
    setting,
    chance,
    share,
    soldOutShare,
    hasDiscounts,
    live,
    avgPrizeMinor: Math.round(avgPrize),
    avgCostMinor: Math.round(avgCost),
    marginMinor,
    costShare: marginMinor > 0 ? ratioToPercent(avgCost, marginMinor) : 0,
    guaranteedMinor: guaranteedOf(t, T),
    monthly,
    perMonth,
    shortStock,
  };
}

/** How many prizes differ from the published case (changed, added or removed). */
export function changes(rows: Row[], published: CaseItemAdmin[]): number {
  const byId = new Map(published.map((it) => [it.id, it]));
  let n = 0;
  const seen = new Set<number>();
  rows.forEach((r, i) => {
    const it = r.id != null ? byId.get(r.id) : undefined;
    if (!it) {
      n++;
      return;
    }
    seen.add(it.id);
    const moved = published.indexOf(it) !== i;
    if (
      moved ||
      it.rarity !== r.rarity ||
      it.weight !== r.weight ||
      it.active !== r.active ||
      it.discountPercent !== r.discountPercent ||
      it.discountUah !== r.discountUah ||
      it.productId !== r.productId
    )
      n++;
  });
  return n + published.filter((it) => !seen.has(it.id)).length;
}

/** Rows of a tier in the board's order: by rarity, then as published. */
export function sortRows(rows: Row[]): Row[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => CASE_RARITY_ORDER.indexOf(a.r.rarity) - CASE_RARITY_ORDER.indexOf(b.r.rarity) || a.i - b.i)
    .map((x) => x.r);
}

/** «24,58» / «0,05»: up to `digits` decimals, Russian separator. */
export function fmtPct(p: number, digits = 2): string {
  if (p > 0 && p < 0.01) return formatNumber(p, "ru-RU", { maximumSignificantDigits: 2 });
  return formatNumber(p, "ru-RU", { maximumFractionDigits: digits });
}

/** «0,05» / «12.5» → number in 0…100 with at most 4 decimals; null otherwise. */
export function parsePct(raw: string): number | null {
  const v = raw.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{0,4})?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/** Lanes of a tier: the jackpot lane only in the gold case (or when a prize is already there). */
export function lanesOf(tier: CaseTier, rows: Row[]): CaseRarity[] {
  return CASE_RARITY_ORDER.filter((r) => r !== "GOLD" || tier === "GOLD" || rows.some((x) => x.rarity === "GOLD"));
}
