import { describe, expect, it } from "vitest";
import type { PaymentOption } from "@/lib/api";
import { dueNowOf, resolvePayment, stepIsValid } from "./totals";

const full = { id: "full", requiresPrepayment: false } as PaymentOption;
const prepay = { id: "pre", requiresPrepayment: true, prepaymentMinor: 20000 } as PaymentOption;

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
});

describe("stepIsValid", () => {
  const base = { nameOk: true, phoneOk: true, delivery: "PICKUP" as const, warehouse: null, paid: false };
  it("contacts need name and phone", () => {
    expect(stepIsValid(0, base)).toBe(true);
    expect(stepIsValid(0, { ...base, phoneOk: false })).toBe(false);
  });
  it("delivery: pickup is enough, Nova Poshta needs a branch", () => {
    expect(stepIsValid(1, base)).toBe(true);
    expect(stepIsValid(1, { ...base, delivery: "NOVA_POSHTA" })).toBe(false);
  });
  it("payment needs a chosen option, the summary is always valid", () => {
    expect(stepIsValid(2, base)).toBe(false);
    expect(stepIsValid(2, { ...base, paid: true })).toBe(true);
    expect(stepIsValid(3, base)).toBe(true);
  });
});
