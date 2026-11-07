import { describe, expect, it } from "vitest";
import type { AdminDispatchOrder } from "@/features/order";
import { approvedUnpaid, awaitingPrepayment, filterCounts, filterOrders, matchesQuery, onlineDue, plainAmount, splitOrders } from "./dispatch";

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
  const order = (o: Partial<AdminDispatchOrder>): AdminDispatchOrder =>
    ({ id: "id", shortId: "1", customerName: "", phone: "", status: "APPROVED", amountDueMinor: 0, prepaymentMinor: 0, receivedMinor: 0, paymentDueAt: null, npCityName: null, npWarehouseName: null, ...o }) as AdminDispatchOrder;
  const paid = order({ id: "a", shortId: "1051", customerName: "Олена Коваль", phone: "+380 67 123 45 67", npCityName: "Київ" });
  const unpaid = order({ id: "b", shortId: "1053", status: "APPROVED", amountDueMinor: 250, paymentDueAt: "2026-01-01T00:00:00Z" });
  const waiting = order({ id: "c", shortId: "1054", status: "NEW", amountDueMinor: 100 });
  const fresh = order({ id: "d", shortId: "1055", status: "NEW" });
  const all = [paid, unpaid, waiting, fresh];

  it("splitOrders puts the dangerous ones first and keeps every order once", () => {
    const s = splitOrders(all);
    expect(s.unpaid.map((o) => o.id)).toEqual(["b", "c"]);
    expect(s.approved.map((o) => o.id)).toEqual(["a"]);
    expect(s.fresh.map((o) => o.id)).toEqual(["d"]);
  });
  it("matchesQuery: name, #id, city, phone in any formatting", () => {
    expect(matchesQuery(paid, "коваль")).toBe(true);
    expect(matchesQuery(paid, "#1051")).toBe(true);
    expect(matchesQuery(paid, "київ")).toBe(true);
    expect(matchesQuery(paid, "067-123")).toBe(true);
    expect(matchesQuery(paid, "9999")).toBe(false);
    expect(matchesQuery(paid, "  ")).toBe(true);
  });
  it("filterOrders / filterCounts", () => {
    expect(filterOrders(all, "ready", "").map((o) => o.id)).toEqual(["a"]);
    expect(filterOrders(all, "unpaid", "").map((o) => o.id)).toEqual(["b", "c"]);
    expect(filterOrders(all, "new", "").map((o) => o.id)).toEqual(["c", "d"]);
    expect(filterOrders(all, "all", "1055").map((o) => o.id)).toEqual(["d"]);
    expect(filterCounts(all)).toEqual({ all: 4, ready: 1, unpaid: 2, new: 2 });
  });
});
