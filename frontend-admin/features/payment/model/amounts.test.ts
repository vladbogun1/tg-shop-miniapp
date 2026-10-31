import { describe, expect, it } from "vitest";
import { isPaymentValid, parseMinor, partialRefundError, paymentAmount } from "./amounts";

const order = { prepaymentMinor: 10_000, totalMinor: 50_000 };
const fmt = (m: number) => `${m / 100} ₴`;

describe("parseMinor", () => {
  it("понимает запятую и точку", () => {
    expect(parseMinor("12,5")).toBe(1250);
    expect(parseMinor("12.5")).toBe(1250);
  });
  it("пусто и не число — 0", () => {
    expect(parseMinor("")).toBe(0);
    expect(parseMinor("abc")).toBe(0);
  });
});

describe("paymentAmount", () => {
  it("по выбранному способу", () => {
    expect(paymentAmount("prepayment", order, 777)).toBe(10_000);
    expect(paymentAmount("full", order, 777)).toBe(50_000);
    expect(paymentAmount("custom", order, 777)).toBe(777);
    expect(paymentAmount(null, order, 777)).toBe(0);
  });
});

describe("isPaymentValid", () => {
  it("нужен способ и сумма в (0; заказ]", () => {
    expect(isPaymentValid(null, 100, 50_000)).toBe(false);
    expect(isPaymentValid("custom", 0, 50_000)).toBe(false);
    expect(isPaymentValid("custom", 50_000, 50_000)).toBe(true);
    expect(isPaymentValid("custom", 50_001, 50_000)).toBe(false);
  });
});

describe("partialRefundError", () => {
  it("без ввода — без ошибки", () => {
    expect(partialRefundError("  ", 0, 1000, fmt)).toBeUndefined();
  });
  it("ноль и превышение остатка", () => {
    expect(partialRefundError("0", 0, 1000, fmt)).toBe("Введите сумму больше нуля");
    expect(partialRefundError("11", 1100, 1000, fmt)).toBe("Не больше 10 ₴ — столько осталось по этому платежу");
    expect(partialRefundError("10", 1000, 1000, fmt)).toBeUndefined();
  });
});
