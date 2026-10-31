import { describe, expect, it } from "vitest";
import { approvedUnpaid, awaitingPrepayment, onlineDue, plainAmount } from "./dispatch";

const base = { amountDueMinor: null as number | null | undefined, prepaymentMinor: 0, receivedMinor: 0 };

describe("dispatch model", () => {
  it("plainAmount is bit-for-bit the old expression", () => {
    const old = (m: number) => (m % 100 === 0 ? String(m / 100) : (m / 100).toFixed(2));
    for (const m of [0, 1, 5, 99, 100, 105, 1005, 12345, 99999, 250000, -5, -100, -250, 1000000]) {
      expect(plainAmount(m)).toBe(old(m));
    }
  });
  it("onlineDue prefers the server amount, else prepayment minus received", () => {
    expect(onlineDue({ ...base, amountDueMinor: 700 })).toBe(700);
    expect(onlineDue({ ...base, prepaymentMinor: 500, receivedMinor: 200 })).toBe(300);
    expect(onlineDue({ ...base, prepaymentMinor: 500, receivedMinor: 900 })).toBe(0);
    expect(onlineDue(base)).toBe(0);
  });
  it("awaitingPrepayment / approvedUnpaid", () => {
    expect(awaitingPrepayment({ ...base, status: "NEW", amountDueMinor: 1 })).toBe(true);
    expect(awaitingPrepayment({ ...base, status: "APPROVED", amountDueMinor: 1 })).toBe(false);
    expect(approvedUnpaid({ ...base, status: "APPROVED", amountDueMinor: 1, paymentDueAt: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(approvedUnpaid({ ...base, status: "APPROVED", amountDueMinor: 1, paymentDueAt: null })).toBe(false);
  });
});
