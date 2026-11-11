import { describe, expect, it } from "vitest";
import { dueNowOf, payOnDeliveryOf, paymentOptionAllowed, paymentOptionsFor, resolvePayment } from "./payment-choice";

const full = { id: "full", requiresPrepayment: false };
const prepay = { id: "pre", requiresPrepayment: true, prepaymentMinor: 20000 };

describe("resolvePayment", () => {
  it("returns the chosen visible option", () => {
    expect(resolvePayment([full, prepay], "pre")).toBe(prepay);
  });
  it("falls back to a full-payment option when the chosen one disappeared", () => {
    expect(resolvePayment([full], "pre")).toBe(full);
  });
  it("is null when nothing was chosen", () => {
    expect(resolvePayment([full], null)).toBeNull();
  });
  it("is null when the chosen one disappeared and only prepayment options remain", () => {
    expect(resolvePayment([prepay], "gone")).toBeNull();
  });
});

describe("dueNowOf", () => {
  it("is the prepayment, capped by the total", () => {
    expect(dueNowOf(prepay, 50000)).toBe(20000);
    expect(dueNowOf(prepay, 10000)).toBe(10000);
  });
  it("is the whole total without a prepayment", () => {
    expect(dueNowOf(full, 50000)).toBe(50000);
    expect(dueNowOf(null, 50000)).toBe(50000);
  });
  it("is the whole total when the prepayment is zero or missing", () => {
    expect(dueNowOf({ id: "x", requiresPrepayment: true, prepaymentMinor: 0 }, 50000)).toBe(50000);
    expect(dueNowOf({ id: "x", requiresPrepayment: true }, 50000)).toBe(50000);
  });
});

describe("checkout v2: оплата при отриманні и ограничения", () => {
  const cod = { id: "cod", requiresPrepayment: false, kind: "ON_DELIVERY" as const };
  const npOnly = { id: "np", requiresPrepayment: false, deliveryMethods: ["WAREHOUSE" as const] };
  const capped = { id: "cap", requiresPrepayment: false, maxTotalMinor: 10000 };

  it("«при отриманні» не для самовывоза и не для покупателя «только онлайн»", () => {
    expect(paymentOptionAllowed(cod, "WAREHOUSE", 5000)).toBe(true);
    expect(paymentOptionAllowed(cod, "PICKUP", 5000)).toBe(false);
    expect(paymentOptionAllowed(cod, "WAREHOUSE", 5000, true)).toBe(false);
  });

  it("список доставок варианта и потолок суммы", () => {
    expect(paymentOptionAllowed(npOnly, "DOORS", 5000)).toBe(false);
    expect(paymentOptionAllowed(npOnly, null, 5000)).toBe(true);
    expect(paymentOptionAllowed(capped, "WAREHOUSE", 10001)).toBe(false);
  });

  it("пропавший выбор не переходит на «при отриманні» молча", () => {
    expect(resolvePayment([cod, full], "gone")).toBe(full);
    expect(resolvePayment([cod], "gone")).toBeNull();
  });

  it("сейчас 0 ₴, всё — при получении; с предоплатой — остаток", () => {
    expect(dueNowOf(cod, 50000)).toBe(0);
    expect(payOnDeliveryOf(cod, 50000)).toBe(50000);
    expect(payOnDeliveryOf(prepay, 50000)).toBe(30000);
    expect(payOnDeliveryOf(full, 50000)).toBe(0);
  });

  it("старый бэкенд без новых полей — варианты как раньше", () => {
    expect(paymentOptionsFor([full, prepay], "WAREHOUSE", 50000).map((o) => o.id)).toEqual(["full", "pre"]);
  });
});
