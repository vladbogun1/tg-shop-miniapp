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
