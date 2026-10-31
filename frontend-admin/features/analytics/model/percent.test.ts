import { describe, expect, it } from "vitest";
import { toPercent } from "@shop/core/percent";
import { percentOf } from "./percent";

// Сверка со старыми формулами: (a / b) * 100, r * 100, (a * 100) / b — бит-в-бит.
describe("проценты", () => {
  const ratios = [0, 0.5, 12.345, 1e-7, 1 / 3, 0.07, 0.29, 1, -0.25];
  it("toPercent = ratio * 100", () => {
    for (const r of ratios) expect(toPercent(r)).toBe(r * 100);
  });
  it("toPercent(a / b) = (a / b) * 100", () => {
    for (const [a, b] of [[1, 3], [7, 9], [0, 5], [5, 5], [29, 100], [123, 456]] as const) expect(toPercent(a / b)).toBe((a / b) * 100);
  });
  it("percentOf = (part * 100) / whole", () => {
    for (const [a, b] of [[1, 3], [7, 9], [0, 5], [5, 5], [29, 100], [123, 456], [0.5, 12.345]] as const) expect(percentOf(a, b)).toBe((a * 100) / b);
  });
});
