import { describe, expect, it } from "vitest";
import {
  floorToUah,
  fractionToPercent,
  guaranteedDiscountMinor,
  percentOf,
  percentToFraction,
  ratioToPercent,
  roundToUah,
} from "./units";

// The formulas the screens used before the helpers existed — the helpers must give the same floats.
const SAMPLES = [0, 0.5, 1, 12.345, 99.99, 100, 149.5, 150, 1e-7, 1234567, -0.5, -12.345, -250, NaN, Infinity];

describe("percent helpers keep the old arithmetic", () => {
  it("percentToFraction = p / 100", () => {
    for (const p of SAMPLES) expect(Object.is(percentToFraction(p), p / 100)).toBe(true);
  });

  it("fractionToPercent = f * 100", () => {
    for (const f of SAMPLES) expect(Object.is(fractionToPercent(f), f * 100)).toBe(true);
  });

  it("ratioToPercent = (a / b) * 100, a zero total is not guarded", () => {
    for (const a of SAMPLES) for (const b of [0, 3, 7, 0.07, -4]) expect(Object.is(ratioToPercent(a, b), (a / b) * 100)).toBe(true);
    expect(ratioToPercent(1, 0)).toBe(Infinity);
    expect(ratioToPercent(0, 0)).toBeNaN();
  });

  it("percentOf = (amount * p) / 100 without rounding", () => {
    for (const a of SAMPLES) for (const p of [0, 15, 12.5, 0.05, -3]) expect(Object.is(percentOf(a, p), (a * p) / 100)).toBe(true);
    expect(percentOf(100_000, 12.5)).toBe(12_500);
    expect(percentOf(333, 15)).toBeCloseTo(49.95, 10);
  });
});

describe("whole-hryvnia rounding", () => {
  it("roundToUah = Math.round(m / 100) * 100", () => {
    for (const m of SAMPLES) expect(Object.is(roundToUah(m), Math.round(m / 100) * 100)).toBe(true);
    expect(roundToUah(149)).toBe(100);
    expect(roundToUah(150)).toBe(200);
    expect(roundToUah(-50)).toBe(-0);
  });

  it("floorToUah = Math.floor(m / 100) * 100", () => {
    for (const m of SAMPLES) expect(Object.is(floorToUah(m), Math.floor(m / 100) * 100)).toBe(true);
    expect(floorToUah(199)).toBe(100);
    expect(floorToUah(-1)).toBe(-100);
  });
});

describe("guaranteedDiscountMinor", () => {
  // The screens' old formula.
  const old = (thr: number, pct: number, maxUah: number) => {
    if (pct <= 0) return 0;
    const g = Math.floor((thr * pct) / 100 / 100) * 100;
    return maxUah > 0 ? Math.min(g, maxUah * 100) : g;
  };

  it("a percent of the threshold, whole hryvnias, with an optional ceiling", () => {
    expect(guaranteedDiscountMinor(300_000, 5, 0)).toBe(15_000);
    expect(guaranteedDiscountMinor(300_000, 5, 100)).toBe(10_000);
    expect(guaranteedDiscountMinor(300_000, 0, 100)).toBe(0);
    expect(guaranteedDiscountMinor(333_300, 7, 0)).toBe(23_300);
  });

  it("matches the old formula on a grid, negatives and NaN included", () => {
    for (const thr of [0, 100, 99_900, 300_000, 1_234_500, -100_000]) {
      for (const pct of [-5, 0, 0.5, 5, 7.5, 33, 50]) {
        for (const max of [0, 1, 100, 100_000]) expect(Object.is(guaranteedDiscountMinor(thr, pct, max), old(thr, pct, max))).toBe(true);
      }
    }
    expect(guaranteedDiscountMinor(NaN, 5, 0)).toBeNaN();
  });
});
