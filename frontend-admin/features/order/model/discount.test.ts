import { describe, expect, it } from "vitest";
import type { PromoCode as PromoCodeFull } from "@/features/promo";
import { canApplyDiscount, manualDiscountMinor, minorFromInput, parseNumberInput, promoDiscountMinor, usablePromos, wholePercent } from "./discount";

const promo = (over: Partial<PromoCodeFull>): PromoCodeFull => ({ id: "1", code: "A", active: true, ...over }) as PromoCodeFull;
const NOW = Date.parse("2026-10-31T12:00:00Z");

describe("ввод", () => {
  it("запятая и мусор", () => {
    expect(parseNumberInput("7,5")).toBe(7.5);
    expect(parseNumberInput("abc")).toBe(0);
    expect(minorFromInput(12.34)).toBe(1234);
    expect(wholePercent(7.5)).toBe(8);
    expect(wholePercent(250)).toBe(100);
  });
});

describe("сохранение поведения при замене /100 и *100", () => {
  it("minorFromInput: 0, 0.5, 12.345, 1e-7, отрицательные, не-числа", () => {
    expect(minorFromInput(0)).toBe(0);
    expect(minorFromInput(0.5)).toBe(50);
    expect(minorFromInput(12.345)).toBe(1235);
    expect(minorFromInput(1e-7)).toBe(0);
    expect(minorFromInput(-0.005)).toBe(-0);
    expect(minorFromInput(-12.345)).toBe(-1234);
    expect(minorFromInput(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(minorFromInput(Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
    expect(minorFromInput(Number.NaN)).toBeNaN();
  });
  it("процент от суммы округляется вниз", () => {
    expect(manualDiscountMinor("percent", 0, 0, 999)).toBe(0);
    expect(manualDiscountMinor("percent", 0, 0.5, 1999)).toBe(9);
    expect(manualDiscountMinor("percent", 0, 12.345, 100000)).toBe(12345);
    expect(manualDiscountMinor("percent", 0, 100, 777)).toBe(777);
    expect(promoDiscountMinor(promo({ discountPercent: 33 }), 1001)).toBe(330);
    expect(promoDiscountMinor(promo({ discountPercent: 7 }), 0)).toBe(0);
  });
});

describe("скидка", () => {
  it("промокод суммой не выше суммы товаров", () => {
    expect(promoDiscountMinor(promo({ discountAmountMinor: 5000 }), 3000)).toBe(3000);
  });
  it("промокод процентом с потолком", () => {
    expect(promoDiscountMinor(promo({ discountPercent: 10, maxDiscountMinor: 5000 }), 100000)).toBe(5000);
    expect(promoDiscountMinor(promo({ discountPercent: 10 }), 100000)).toBe(10000);
  });
  it("ручная: сумма режется по товарам, процент округляется вниз", () => {
    expect(manualDiscountMinor("amount", 100, 0, 5000)).toBe(5000);
    expect(manualDiscountMinor("percent", 0, 15, 999)).toBe(149);
  });
  it("кнопка «Применить»", () => {
    expect(canApplyDiscount("promo", "amount", "", 0, 0)).toBe(false);
    expect(canApplyDiscount("promo", "amount", "A", 0, 0)).toBe(true);
    expect(canApplyDiscount("manual", "percent", "", 0, 0)).toBe(false);
    expect(canApplyDiscount("manual", "amount", "", 1, 0)).toBe(true);
  });
});

describe("usablePromos", () => {
  it("не предлагает неактивные, исчерпанные и просроченные", () => {
    const list = [
      promo({ id: "a", code: "OK", origin: "OURS" }),
      promo({ id: "b", code: "OFF", active: false, origin: "OURS" }),
      promo({ id: "c", code: "FULL", maxUses: 1, usesCount: 1, origin: "OURS" }),
      promo({ id: "d", code: "OLD", expiresAt: "2026-10-01T00:00:00Z", origin: "OURS" }),
    ];
    expect(usablePromos(list, 1, NOW).map((p) => p.code)).toEqual(["OK"]);
  });
});
