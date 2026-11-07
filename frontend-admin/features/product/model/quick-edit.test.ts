import { describe, expect, it } from "vitest";
import { parsePriceMinor, parseStock, planQuickEdit, withQuickEdit } from "./quick-edit";
import { product } from "./test-helpers";

describe("parseStock / parsePriceMinor", () => {
  it("остаток — целое от нуля", () => {
    expect(parseStock(" 12 ")).toBe(12);
    expect(parseStock("0")).toBe(0);
    expect(parseStock("-1")).toBeNull();
    expect(parseStock("1.5")).toBeNull();
    expect(parseStock("")).toBeNull();
  });
  it("цена — гривны с запятой или точкой, больше нуля", () => {
    expect(parsePriceMinor("1 250,50")).toBe(125050);
    expect(parsePriceMinor("99.9")).toBe(9990);
    expect(parsePriceMinor("0")).toBeNull();
    expect(parsePriceMinor("abc")).toBeNull();
  });
});

describe("planQuickEdit", () => {
  it("правка остатка шлёт stock вместе с expectedStock; уменьшение — с причиной", () => {
    const plan = planQuickEdit(product({ stock: 5 }), { kind: "stock", stock: 2 });
    if (!plan.ok) throw new Error("ожидали ok");
    expect(plan.drop).toBe(3);
    expect(plan.raised).toEqual([]);
    expect(plan.body({ reason: "DEFECT", note: "брак" })).toEqual({ stock: 2, expectedStock: 5, stockReason: "DEFECT", stockNote: "брак" });
  });
  it("увеличение остатка: причины нет, брони можно раздать", () => {
    const plan = planQuickEdit(product({ stock: 1 }), { kind: "stock", stock: 4 });
    if (!plan.ok) throw new Error("ожидали ok");
    expect(plan.drop).toBe(0);
    expect(plan.raised).toEqual([null]);
    expect(plan.body(null)).toEqual({ stock: 4, expectedStock: 1 });
  });
  it("правка цены шлёт только цену и ту, что видел админ", () => {
    const plan = planQuickEdit(product({ stock: 5, priceMinor: 10000 }), { kind: "price", priceMinor: 12000 });
    if (!plan.ok) throw new Error("ожидали ok");
    expect(plan.body(null)).toEqual({ priceMinor: 12000, expectedPriceMinor: 10000 });
  });
  it("то же значение — noop", () => {
    const p = product({ stock: 5, priceMinor: 10000 });
    expect(planQuickEdit(p, { kind: "stock", stock: 5 })).toMatchObject({ ok: true, noop: true });
    expect(planQuickEdit(p, { kind: "price", priceMinor: 10000 })).toMatchObject({ ok: true, noop: true });
  });
  it("остаток товара с вариантами — только в окне товара", () => {
    const p = product({ variants: [{ id: "v1", name: "A", stock: 2 }] as never });
    expect(planQuickEdit(p, { kind: "stock", stock: 1 }).ok).toBe(false);
  });
  it("цена не выше «старой цены»", () => {
    const p = product({ priceMinor: 10000, compareAtMinor: 15000 });
    expect(planQuickEdit(p, { kind: "price", priceMinor: 15000 }).ok).toBe(false);
    expect(planQuickEdit(p, { kind: "price", priceMinor: 14000 }).ok).toBe(true);
  });
});

describe("withQuickEdit", () => {
  it("подставляет цену или остаток и не трогает остальное", () => {
    const p = product({ stock: 5, priceMinor: 10000 });
    expect(withQuickEdit(p, { kind: "price", priceMinor: 9000 })).toMatchObject({ priceMinor: 9000, stock: 5 });
    expect(withQuickEdit(p, { kind: "stock", stock: 2 })).toMatchObject({ priceMinor: 10000, stock: 2 });
  });
});
