import { describe, expect, it } from "vitest";
import { dueNowOf, resolvePayment } from "./payment-choice";

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
