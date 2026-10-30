import { describe, expect, it } from "vitest";
import { allowedTargets, canTransition, codMinor, customerCancelMode, isNovaPoshtaTtn, isOrderLimitCode, maxQty, needsTopUp, payableMinor, paymentFirst, paymentState, visiblePaymentOptions } from "./orders";

describe("status transitions mirror the backend", () => {
  it("allows the forward path and rejection, never back to NEW or out of REJECTED", () => {
    expect(canTransition("NEW", "APPROVED")).toBe(true);
    expect(canTransition("NEW", "SHIPPED")).toBe(true);
    expect(canTransition("DELIVERED", "REJECTED")).toBe(true);
    expect(canTransition("APPROVED", "NEW")).toBe(false);
    expect(canTransition("NEW", "NEW")).toBe(false);
    expect(allowedTargets("REJECTED")).toEqual([]);
  });
});

describe("money of an order", () => {
  it("payable = total minus what was refused at the branch; never negative", () => {
    expect(payableMinor({ totalMinor: 10_000 })).toBe(10_000);
    expect(payableMinor({ totalMinor: 10_000, uncollectedMinor: 3_000 })).toBe(7_000);
    expect(payableMinor({ totalMinor: 1_000, uncollectedMinor: 5_000 })).toBe(0);
  });

  it("cash on delivery = payable minus what is already received", () => {
    expect(codMinor({ totalMinor: 10_000, receivedMinor: 4_000 })).toBe(6_000);
    expect(codMinor({ totalMinor: 10_000, receivedMinor: 4_000, uncollectedMinor: 6_000 })).toBe(0);
  });

  it("needsTopUp: only a paid, still-editable order with an amount due", () => {
    expect(needsTopUp({ paid: true, status: "NEW", amountDueMinor: 500 })).toBe(true);
    expect(needsTopUp({ paid: true, status: "SHIPPED", amountDueMinor: 500 })).toBe(false);
    expect(needsTopUp({ paid: true, status: "NEW", amountDueMinor: 0 })).toBe(false);
    expect(needsTopUp({ paid: false, status: "NEW", amountDueMinor: 500 })).toBe(false);
    expect(needsTopUp({ paid: false, status: "NEW", amountDueMinor: 500, exchangeOfId: "x" })).toBe(true);
  });
});

describe("paymentState", () => {
  it("PAID / PARTIAL / AWAITING / UNPAID", () => {
    expect(paymentState({ paid: true, totalMinor: 10_000, receivedMinor: 10_000 })).toBe("PAID");
    expect(paymentState({ paid: true, totalMinor: 10_000, receivedMinor: 3_000 })).toBe("PARTIAL");
    expect(paymentState({ paid: true, totalMinor: 10_000 })).toBe("PAID");
    expect(paymentState({ paid: false, status: "NEW", paymentDueAt: "2026-10-08T00:00:00Z" })).toBe("AWAITING");
    expect(paymentState({ paid: false, status: "REJECTED", paymentDueAt: "2026-10-08T00:00:00Z" })).toBe("UNPAID");
    expect(paymentState({ paid: false })).toBe("UNPAID");
  });

  it("the uncollected part is not a shortfall", () => {
    expect(paymentState({ paid: true, totalMinor: 10_000, receivedMinor: 7_000, uncollectedMinor: 3_000 })).toBe("PAID");
  });
});

describe("customerCancelMode", () => {
  it("an unpaid open order cancels at once, a paid one files a request", () => {
    expect(customerCancelMode({ status: "NEW", paid: false })).toBe("CANCEL");
    expect(customerCancelMode({ status: "APPROVED", paid: true })).toBe("REQUEST");
    expect(customerCancelMode({ status: "NEW", paid: false, receivedMinor: 100 })).toBe("REQUEST");
  });

  it("request states, a payment in progress and shipped orders", () => {
    expect(customerCancelMode({ status: "NEW", paid: true, cancelRequestStatus: "PENDING" })).toBe("PENDING");
    expect(customerCancelMode({ status: "NEW", paid: true, cancelRequestStatus: "DECLINED" })).toBe("DECLINED");
    expect(customerCancelMode({ status: "SHIPPED", paid: true, cancelRequestStatus: "APPROVED" })).toBe("APPROVED");
    expect(customerCancelMode({ status: "NEW", paid: false, payment: { status: "processing" } })).toBe("PROCESSING");
    expect(customerCancelMode({ status: "SHIPPED", paid: true })).toBe("RETURNS");
    expect(customerCancelMode({ status: "REJECTED", paid: false })).toBe("NONE");
  });
});

describe("paymentFirst", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  it("leads while the order is open and for a day after it was paid", () => {
    expect(paymentFirst({ status: "NEW" }, now)).toBe(true);
    expect(paymentFirst({ status: "SHIPPED", paidAt: "2026-10-10T00:00:00Z" }, now)).toBe(true);
    expect(paymentFirst({ status: "SHIPPED", paidAt: "2026-10-08T00:00:00Z" }, now)).toBe(false);
    expect(paymentFirst({ status: "REJECTED", paidAt: "2026-10-10T00:00:00Z" }, now)).toBe(false);
    expect(paymentFirst({ status: "DELIVERED" }, now)).toBe(false);
  });
});

describe("checkout helpers", () => {
  it("visiblePaymentOptions drops a prepayment that would cover the whole order", () => {
    const opts = [
      { id: "cod", requiresPrepayment: false },
      { id: "pre", requiresPrepayment: true, prepaymentMinor: 20_000 },
    ];
    expect(visiblePaymentOptions(opts, 15_000).map((o) => o.id)).toEqual(["cod"]);
    expect(visiblePaymentOptions(opts, 50_000).map((o) => o.id)).toEqual(["cod", "pre"]);
    const onlyPre = [opts[1]];
    expect(visiblePaymentOptions(onlyPre, 15_000)).toEqual(onlyPre);
  });

  it("maxQty: stock capped by the anti-bot limit, 0 = no limit", () => {
    expect(maxQty(10, { maxQtyPerProduct: 3 })).toBe(3);
    expect(maxQty(2, { maxQtyPerProduct: 3 })).toBe(2);
    expect(maxQty(10, { maxQtyPerProduct: 0 })).toBe(10);
    expect(maxQty(10, undefined)).toBe(10);
  });

  it("order limit codes and Nova Poshta TTN", () => {
    expect(isOrderLimitCode("ORDER_COOLDOWN")).toBe(true);
    expect(isOrderLimitCode("OTHER")).toBe(false);
    expect(isOrderLimitCode(null)).toBe(false);
    expect(isNovaPoshtaTtn("20450123456789")).toBe(true);
    expect(isNovaPoshtaTtn("20 4501 2345 6789")).toBe(true);
    expect(isNovaPoshtaTtn("123")).toBe(false);
  });
});
