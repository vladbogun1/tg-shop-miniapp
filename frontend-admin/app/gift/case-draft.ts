/**
 * The case builder's draft (docs/GIFT-CASE.md, «Конструктор»): the tier's prizes edited locally and
 * published at once (PUT /api/admin/gift/tiers/{tier}/items). Chances are kept summing to 100 % over the
 * prizes that can drop: changing one chance (or a rarity's share) rescales the others in proportion.
 *
 * Money of the summary: no cost price in the shop, so a product prize costs price × (1 − margin) and a
 * discount prize its full amount (a percent one — that percent of the threshold).
 */
import { CASE_RARITY_ORDER, type CaseRarity, type CaseTier } from "@shop/core/giftcase";
import type { CaseDraftItem, CaseItemAdmin, DraftItem, GiftTierAdmin } from "@/lib/gift";

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

/** Can drop now: switched on, chance > 0, a discount with a value / a product in stock and visible. */
export function canDrop(r: Row): boolean {
  if (!r.active || r.weight <= 0) return false;
  return r.kind === "DISCOUNT" ? r.discountPercent > 0 || r.discountUah > 0 : r.stock > 0 && r.productActive;
}

export function liveTotal(rows: Row[]): number {
  return rows.reduce((s, r) => s + (canDrop(r) ? r.weight : 0), 0);
}

/** Real chance, % — as the server draws (over the prizes that can drop). */
export function chanceOf(r: Row, total: number): number {
  return canDrop(r) && total > 0 ? (r.weight / total) * 100 : 0;
}

/** The live prizes except `keep` are rescaled so the live sum is 100 %. */
export function normalize(rows: Row[], keep: Set<string> = new Set()): Row[] {
  const live = rows.filter(canDrop);
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
  return row && canDrop(row) ? normalize(next, new Set([key])) : next;
}

/** A rarity's total chance → `percent` (its prizes keep their proportions); the other rarities share the rest. */
export function setLaneShare(rows: Row[], rarity: CaseRarity, percent: number): Row[] {
  const lane = rows.filter((r) => r.rarity === rarity && canDrop(r));
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
  return canDrop(next[next.length - 1]) ? normalize(next, new Set([row.key])) : next;
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
  if (r.kind === "DISCOUNT") return r.discountPercent > 0 ? (thresholdMinor * r.discountPercent) / 100 : r.discountUah * 100;
  return r.priceMinor * (1 - marginPercent / 100);
}

export interface Summary {
  total: number;
  chance: Map<string, number>;
  share: Record<CaseRarity, number>;
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

export function summarize(rows: Row[], t: GiftTierAdmin | null): Summary {
  const T = (t?.thresholdUah ?? 0) * 100;
  const margin = t?.marginPercent ?? 15;
  const total = liveTotal(rows);
  const chance = new Map<string, number>();
  const share = Object.fromEntries(CASE_RARITY_ORDER.map((r) => [r, 0])) as Record<CaseRarity, number>;
  let avgPrize = 0;
  let avgCost = 0;
  let live = 0;
  const monthly = t?.monthlyOrders ?? 0;
  const perMonth = new Map<string, number>();
  const shortStock: Row[] = [];
  for (const r of rows) {
    const c = chanceOf(r, total);
    chance.set(r.key, c);
    if (c <= 0) continue;
    live++;
    share[r.rarity] += c;
    if (r.kind === "PRODUCT") avgPrize += (c / 100) * r.priceMinor;
    avgCost += (c / 100) * costMinor(r, T, margin);
    const pm = (monthly * c) / 100;
    perMonth.set(r.key, pm);
    if (r.kind === "PRODUCT" && pm > r.stock) shortStock.push(r);
  }
  const marginMinor = (T * margin) / 100;
  let guaranteed = 0;
  if (t && t.guaranteedPercent > 0) {
    guaranteed = Math.floor((T * t.guaranteedPercent) / 100 / 100) * 100;
    if (t.guaranteedMaxUah > 0) guaranteed = Math.min(guaranteed, t.guaranteedMaxUah * 100);
  }
  return {
    total,
    chance,
    share,
    live,
    avgPrizeMinor: Math.round(avgPrize),
    avgCostMinor: Math.round(avgCost),
    marginMinor,
    costShare: marginMinor > 0 ? (avgCost / marginMinor) * 100 : 0,
    guaranteedMinor: guaranteed,
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
  if (p > 0 && p < 0.01) return p.toLocaleString("ru-RU", { maximumSignificantDigits: 2 });
  return p.toLocaleString("ru-RU", { maximumFractionDigits: digits });
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
