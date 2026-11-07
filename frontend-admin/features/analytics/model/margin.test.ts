import { describe, expect, it } from "vitest";
import { losingRows, sortRows, waterfallBars } from "./margin";
import type { MarginReport, MarginRow } from "./types";

const row = (key: string, revenueMinor: number, profitMinor: number, marginPct: number): MarginRow => ({
  key,
  label: key,
  revenueMinor,
  profitMinor,
  marginPct,
  costMinor: revenueMinor - profitMinor,
  units: 1,
  unknownRevenueMinor: 0,
});

describe("waterfallBars", () => {
  const r = {
    revenueMinor: 50_000,
    knownRevenueMinor: 40_000,
    costMinor: 25_000,
    feeMinor: 1_000,
    giftsCostMinor: 2_000,
    profitMinor: 14_000,
  } as MarginReport;

  it("считает как «Прибыль» системы: подарки не вычитаются второй раз", () => {
    const [known, cost, fee, profit] = waterfallBars(r);
    expect(known.valueMinor - -cost.valueMinor - -fee.valueMinor).toBe(profit.valueMinor);
    expect(cost.note).toBe("в том числе подарки");
    expect(cost.leftPct).toBeCloseTo(37.5);
    expect(cost.widthPct).toBeCloseTo(62.5);
    expect(fee.leftPct).toBeCloseTo(35);
    expect(profit.widthPct).toBeCloseTo(35);
  });

  it("убыток не уходит за шкалу", () => {
    const bars = waterfallBars({ ...r, costMinor: 45_000, profitMinor: -6_000 });
    expect(bars[3].tone).toBe("loss");
    expect(bars[3].widthPct).toBe(0);
    for (const b of bars) expect(b.leftPct + b.widthPct).toBeLessThanOrEqual(100.0001);
  });

  it("нулевая выручка не делит на ноль", () => {
    const bars = waterfallBars({ ...r, knownRevenueMinor: 0, costMinor: 0, feeMinor: 0, profitMinor: 0 });
    expect(bars.every((b) => Number.isFinite(b.widthPct))).toBe(true);
  });
});

describe("sortRows / losingRows", () => {
  const rows = [row("a", 100, 10, 10), row("b", 300, -5, -1.6), row("c", 200, 50, 25), row("d", 50, 1, 2)];
  it("сортирует", () => {
    expect(sortRows(rows, "profit").map((x) => x.key)).toEqual(["c", "a", "d", "b"]);
    expect(sortRows(rows, "revenue")[0].key).toBe("b");
    expect(sortRows(rows, "margin")[0].key).toBe("b");
    expect(sortRows(rows, "default")).toBe(rows);
  });
  it("«Где теряю»", () => {
    const { loss, thin } = losingRows(rows, 2);
    expect(loss.map((x) => x.key)).toEqual(["b"]);
    expect(thin.map((x) => x.key)).toEqual(["d", "a"]);
  });
});
