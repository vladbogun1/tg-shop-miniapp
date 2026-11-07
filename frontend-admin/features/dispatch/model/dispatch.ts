import { toMajor } from "@shop/core/money";
import { nowMs } from "@shop/core/time";
import type { AdminDispatchOrder } from "@/features/order";

type DueFields = { amountDueMinor?: number | null; prepaymentMinor: number; receivedMinor: number };

/**
 * Online part still unpaid (backend `amountDueMinor`): the prepayment, or the whole order for «Полная
 * оплата онлайн» (prepaymentMinor = 0 there, so the old prepayment-only check missed those).
 */
export function onlineDue(o: DueFields): number {
  return o.amountDueMinor ?? (o.prepaymentMinor > 0 ? Math.max(0, o.prepaymentMinor - o.receivedMinor) : 0);
}

/** NEW order whose online payment (prepayment or full) has not arrived yet. */
export function awaitingPrepayment(o: DueFields & Pick<AdminDispatchOrder, "status">): boolean {
  return o.status === "NEW" && onlineDue(o) > 0;
}

/**
 * APPROVED although its online payment never arrived (an online-payment order has a deadline; older
 * ones do not). Shipping stays possible — «Отправлено» asks for a confirmation first.
 */
export function approvedUnpaid(o: DueFields & Pick<AdminDispatchOrder, "status" | "paymentDueAt">): boolean {
  return o.status !== "NEW" && !!o.paymentDueAt && onlineDue(o) > 0;
}

/** The payment deadline of an approved-unpaid order has passed. */
export function dueExpired(o: Pick<AdminDispatchOrder, "paymentDueAt">, unpaid: boolean): boolean {
  return unpaid && !!o.paymentDueAt && Date.parse(o.paymentDueAt) <= nowMs();
}

/** COD amount as it goes to the clipboard for the Nova Poshta form: «250», or «250.50» with kopecks (no grouping). */
export function plainAmount(minor: number): string {
  if (minor % 100 === 0) return String(toMajor(minor));
  const sign = minor < 0 ? "-" : "";
  const kop = String(Math.abs(minor) % 100).padStart(2, "0");
  return `${sign}${Math.trunc(Math.abs(toMajor(minor)))}.${kop}`;
}

type Listed = Pick<AdminDispatchOrder, "status" | "paymentDueAt"> & DueFields;

/** The online payment has not arrived: a NEW order still waiting for it, or an APPROVED one shipped-to-be without it. */
export function isUnpaid(o: Listed): boolean {
  return awaitingPrepayment(o) || approvedUnpaid(o);
}

export interface DispatchSections {
  /** Dangerous first: do not send (NEW, waiting for money) or send only with a confirmation (APPROVED, never paid). */
  unpaid: AdminDispatchOrder[];
  /** APPROVED and nothing owed online. */
  approved: AdminDispatchOrder[];
  /** NEW with nothing owed online — can go out at once. */
  fresh: AdminDispatchOrder[];
}

export function splitOrders(orders: AdminDispatchOrder[]): DispatchSections {
  const out: DispatchSections = { unpaid: [], approved: [], fresh: [] };
  for (const o of orders) {
    if (isUnpaid(o)) out.unpaid.push(o);
    else if (o.status === "NEW") out.fresh.push(o);
    else out.approved.push(o);
  }
  return out;
}

export type DispatchFilter = "all" | "ready" | "unpaid" | "new";

/** Digits only: «+380 67 123-45-67» and «0671234567» find the same order. */
const digits = (s: string) => s.replace(/\D+/g, "");

/** Search by name, phone (any formatting), #id, city or branch. Empty query matches everything. */
export function matchesQuery(o: AdminDispatchOrder, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  if (!q) return true;
  const text = [o.customerName, o.shortId, o.id, o.npCityName, o.npWarehouseName].some((v) => (v ?? "").toLowerCase().includes(q));
  const qd = digits(q);
  return text || (qd.length >= 3 && digits(o.phone).includes(qd));
}

/** The list after the toolbar's chip and search. */
export function filterOrders(orders: AdminDispatchOrder[], filter: DispatchFilter, query: string): AdminDispatchOrder[] {
  return orders.filter((o) => {
    if (!matchesQuery(o, query)) return false;
    switch (filter) {
      case "ready":
        return o.status !== "NEW" && !isUnpaid(o);
      case "unpaid":
        return isUnpaid(o);
      case "new":
        return o.status === "NEW";
      default:
        return true;
    }
  });
}

/** Numbers on the chips (always over the whole list, not the searched one). */
export function filterCounts(orders: AdminDispatchOrder[]): Record<DispatchFilter, number> {
  return {
    all: orders.length,
    ready: filterOrders(orders, "ready", "").length,
    unpaid: orders.filter(isUnpaid).length,
    new: orders.filter((o) => o.status === "NEW").length,
  };
}
