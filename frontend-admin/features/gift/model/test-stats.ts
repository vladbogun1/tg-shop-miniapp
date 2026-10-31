/**
 * Numbers of the «Тест кейса» session: how many times each prize dropped against its real chance.
 * Mixing runs of different chances would make the comparison meaningless, so a run with other chances
 * starts the session over.
 */
import { caseDiscountText, type CaseItem } from "@shop/core/giftcase";
import { formatNumber } from "@shop/core/money";
import { money } from "@/lib/money";
import type { CaseItemAdmin, CaseTestDraw } from "./types";

/** The session's numbers of one tier. */
export interface TestStats {
  /** Draws so far. */
  n: number;
  /** gift_case_items.id → drops. */
  hits: Record<number, number>;
  /** gift_case_items.id → real chance, % (the latest run's). */
  chances: Record<number, number>;
  /** The chances the numbers were counted with («id:chance,…»): a different one starts over. */
  sig: string;
}

export const EMPTY_STATS: TestStats = { n: 0, hits: {}, chances: {}, sig: "" };

/** «24,58» / «0,001»: up to 4 decimals, Russian separator. */
export function pct(p: number, digits = 4): string {
  return formatNumber(p, "ru-RU", { maximumFractionDigits: digits });
}

function prizeKey(it: CaseItemAdmin): string {
  return it.kind === "DISCOUNT" ? `d${it.id}` : `p${it.productId}`;
}

/** An admin prize as the case screen sees it. */
export function toCaseItem(it: CaseItemAdmin): CaseItem {
  return {
    key: prizeKey(it),
    kind: it.kind,
    productId: it.productId,
    title: it.kind === "DISCOUNT" ? null : it.title,
    imageUrl: it.imageUrl,
    priceMinor: it.priceMinor,
    rarity: it.rarity,
    discountPercent: it.discountPercent,
    discountAmountMinor: it.discountPercent > 0 ? 0 : it.discountUah * 100,
  };
}

export function itemTitle(it: CaseItem): string {
  return it.kind === "DISCOUNT" ? `Скидка ${caseDiscountText(it, money)}` : it.title ?? "Товар";
}

/** The run's numbers added to the session (or a fresh session when the chances changed). */
export function addRun(prev: TestStats, res: CaseTestDraw): { next: TestStats; restarted: boolean } {
  const sig = res.hits.map((h) => `${h.id}:${h.chancePercent}`).join(",");
  const restarted = prev.n > 0 && prev.sig !== sig;
  const base = restarted ? EMPTY_STATS : prev;
  const hits = { ...base.hits };
  const chances: Record<number, number> = {};
  for (const h of res.hits) {
    hits[h.id] = (hits[h.id] ?? 0) + h.hits;
    chances[h.id] = h.chancePercent;
  }
  return { next: { n: base.n + res.count, hits, chances, sig }, restarted };
}

/** A prize of the session's table. */
export interface StatLine {
  id: number;
  it: CaseItemAdmin | undefined;
  hits: number;
  chance: number;
  fact: number;
  odd: boolean;
}

/** The table: dearest chance first; `odd` — the share in the test strays past ~3σ of a binomial run (100+ draws only). */
export function statLines(stats: TestStats, byId: Map<number, CaseItemAdmin>): StatLine[] {
  return Object.keys(stats.chances)
    .map(Number)
    .map((id) => {
      const hits = stats.hits[id] ?? 0;
      const chance = stats.chances[id] ?? 0;
      const fact = stats.n > 0 ? (hits / stats.n) * 100 : 0;
      const p = chance / 100;
      const sigma = stats.n > 0 ? Math.sqrt((p * (1 - p)) / stats.n) * 100 : 0;
      const odd = stats.n >= 100 && sigma > 0 && Math.abs(fact - chance) > 3 * sigma;
      return { id, it: byId.get(id), hits, chance, fact, odd };
    })
    .sort((a, b) => b.chance - a.chance || a.id - b.id);
}
