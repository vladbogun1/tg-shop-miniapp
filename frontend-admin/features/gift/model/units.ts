/**
 * Percent and whole-hryvnia arithmetic of the gift screens. Chances, margins and shares are percents
 * (not money); sums of money stay in kopecks and go through `@shop/core/money` where they are plain
 * conversions. The formulas here are the ones the screens always used — the order of the operations is
 * kept, so the floats come out bit for bit the same.
 */
import { toMinor } from "@shop/core/money";

/** Percent base: 100 % = 1. */
const PERCENT = 100;
/** Kopecks in a hryvnia — only for rounding a kopeck sum to whole hryvnias. */
const KOP_PER_UAH = 100;

/** 12 (%) → 0.12. */
export function percentToFraction(percent: number): number {
  return percent / PERCENT;
}

/** 0.12 → 12 (%). */
export function fractionToPercent(fraction: number): number {
  return fraction * PERCENT;
}

/** `part` of `total`, %. Not guarded: a zero `total` gives Infinity/NaN as the plain division does. */
export function ratioToPercent(part: number, total: number): number {
  return (part / total) * PERCENT;
}

/** `percent` % of `amount` (kept fractional — the caller rounds). */
export function percentOf(amount: number, percent: number): number {
  return (amount * percent) / PERCENT;
}

/** Kopecks rounded to the nearest whole hryvnia, still in kopecks. */
export function roundToUah(minor: number): number {
  return Math.round(minor / KOP_PER_UAH) * KOP_PER_UAH;
}

/** Kopecks cut down to a whole hryvnia, still in kopecks. */
export function floorToUah(minor: number): number {
  return Math.floor(minor / KOP_PER_UAH) * KOP_PER_UAH;
}

/**
 * The guaranteed discount on an order of `thresholdMinor`: `percent` % of it, cut to whole hryvnias,
 * at most `maxUah` ₴ (0 = no ceiling). 0 when the percent is off.
 */
export function guaranteedDiscountMinor(thresholdMinor: number, percent: number, maxUah: number): number {
  if (percent <= 0) return 0;
  const g = floorToUah(percentOf(thresholdMinor, percent));
  return maxUah > 0 ? Math.min(g, toMinor(maxUah)) : g;
}
