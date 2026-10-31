import { describe, expect, it } from "vitest";
import { invoiceStatusLabel, invoiceStatusTone, isOverdue, maskedPanShort, paymentMethodLabel, refundableMinor, timeLeft } from "./online-payment";
import type { AdminInvoice } from "./types";

const NOW = Date.parse("2026-10-31T12:00:00Z");
const inv = (over: Partial<AdminInvoice>): AdminInvoice => ({ status: "success", amountMinor: 10000, refundedMinor: 0, ...over }) as AdminInvoice;

describe("timeLeft", () => {
  const at = (ms: number) => new Date(NOW + ms).toISOString();
  it("минуты", () => expect(timeLeft(at(40 * 60_000), NOW)).toBe("40 мин"));
  it("округляет вверх", () => expect(timeLeft(at(59 * 60_000 + 1), NOW)).toBe("1 ч"));
  it("часы с минутами до 6 ч", () => expect(timeLeft(at(5 * 3_600_000 + 20 * 60_000), NOW)).toBe("5 ч 20 мин"));
  it("часы без минут от 6 ч", () => expect(timeLeft(at(7 * 3_600_000 + 20 * 60_000), NOW)).toBe("7 ч"));
  it("дни", () => expect(timeLeft(at(27 * 3_600_000), NOW)).toBe("1 дн 3 ч"));
  it("целые дни", () => expect(timeLeft(at(48 * 3_600_000), NOW)).toBe("2 дн"));
  it("прошло и мусор", () => {
    expect(timeLeft(at(-1), NOW)).toBeNull();
    expect(timeLeft("nope", NOW)).toBeNull();
  });
});

describe("isOverdue", () => {
  it("граница включена", () => expect(isOverdue(new Date(NOW).toISOString(), NOW)).toBe(true));
  it("в будущем и пусто", () => {
    expect(isOverdue(new Date(NOW + 1).toISOString(), NOW)).toBe(false);
    expect(isOverdue(null, NOW)).toBe(false);
    expect(isOverdue("x", NOW)).toBe(false);
  });
});

describe("refundableMinor", () => {
  it("не оплачен — 0", () => expect(refundableMinor(inv({ status: "created" }))).toBe(0));
  it("всё доступно", () => expect(refundableMinor(inv({}))).toBe(10000));
  it("минус уже возвращённое", () => expect(refundableMinor(inv({ refundedMinor: 3000 }))).toBe(7000));
  it("берёт строгое из двух", () => expect(refundableMinor(inv({ finalAmountMinor: 6000, refundedMinor: 3000 }))).toBe(6000));
  it("не уходит ниже нуля", () => expect(refundableMinor(inv({ refundedMinor: 20000 }))).toBe(0));
});

describe("подписи", () => {
  it("маска карты", () => {
    expect(maskedPanShort("444403******1902")).toBe("•••• 1902");
    expect(maskedPanShort("12")).toBe("12");
    expect(maskedPanShort(null)).toBeNull();
  });
  it("способ оплаты", () => {
    expect(paymentMethodLabel("APPLE")).toBe("Apple Pay");
    expect(paymentMethodLabel("crypto")).toBe("crypto");
    expect(paymentMethodLabel("")).toBeNull();
  });
  it("статус неизвестный проходит как есть", () => {
    expect(invoiceStatusLabel("success")).toBe("Оплачен");
    expect(invoiceStatusLabel("future")).toBe("future");
    expect(invoiceStatusTone("future")).toBe("neutral");
  });
});
