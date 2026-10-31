/**
 * Карточка заказа: какие действия доступны, чистые правила (без React).
 * Все условия — как были в OrderDrawer; тесты в drawer-rules.test.ts.
 */
import type { OrderStatus } from "@shop/core/types";
import type { AdminOrderDetail } from "../api";
import { allowedTargets } from "./status";

/** The one big button on a phone: the next step of the happy path. */
export const PRIMARY_TARGET: Partial<Record<OrderStatus, OrderStatus>> = {
  NEW: "APPROVED",
  APPROVED: "SHIPPED",
  SHIPPED: "DELIVERED",
};

/** Transitions that open a modal (extra input or an explicit confirmation). */
const NEEDS_MODAL: OrderStatus[] = ["SHIPPED", "REJECTED", "DELIVERED"];

export function needsModal(target: OrderStatus): boolean {
  return NEEDS_MODAL.includes(target);
}

export type RuleOrder = Pick<AdminOrderDetail, "status" | "receivedMinor" | "refundedMinor" | "totalMinor" | "admin" | "items">;

/** Return: the goods reached (or are on the way to) the customer, or money has to go back. */
export function canReturn(order: RuleOrder): boolean {
  return (
    order.status === "SHIPPED" ||
    order.status === "DELIVERED" ||
    (order.status === "REJECTED" && order.receivedMinor > (order.refundedMinor ?? 0)) ||
    // After an exchange for something cheaper: the overpayment can go back before shipping.
    ((order.status === "NEW" || order.status === "APPROVED") && order.receivedMinor - (order.refundedMinor ?? 0) > order.totalMinor)
  );
}

/** Exchange: only once the customer has the parcel — a refused one comes back through «Отклонить». */
export function canExchange(order: Pick<RuleOrder, "status">): boolean {
  return order.status === "DELIVERED";
}

/** Merge is possible for two orders that have not shipped yet (the button also needs a candidate). */
export function isMergeable(order: Pick<RuleOrder, "status" | "admin">): boolean {
  return (order.status === "NEW" || order.status === "APPROVED") && !order.admin?.archivedAt;
}

export interface DrawerRules {
  isTerminal: boolean;
  archived: boolean;
  canArchive: boolean;
  canUnarchive: boolean;
  inTransit: boolean;
  canReturn: boolean;
  canExchange: boolean;
  mergeable: boolean;
  targets: OrderStatus[];
  primary: OrderStatus | undefined;
  restockUnits: number | undefined;
}

const NO_ORDER_RULES: DrawerRules = {
  isTerminal: false,
  archived: false,
  canArchive: false,
  canUnarchive: false,
  inTransit: false,
  canReturn: false,
  canExchange: false,
  mergeable: false,
  targets: [],
  primary: undefined,
  restockUnits: undefined,
};

/** Orders are never deleted: the main admin archives a closed one (reason required). */
export function drawerRules(order: RuleOrder | undefined, isSuper: boolean): DrawerRules {
  if (!order) return NO_ORDER_RULES;
  const isTerminal = order.status === "DELIVERED" || order.status === "REJECTED";
  const archived = !!order.admin?.archivedAt;
  return {
    isTerminal,
    archived,
    canArchive: isSuper && isTerminal && !archived,
    canUnarchive: isSuper && archived,
    inTransit: order.admin?.returnStatus === "IN_TRANSIT",
    canReturn: canReturn(order),
    canExchange: canExchange(order),
    mergeable: isMergeable(order),
    targets: allowedTargets(order.status),
    primary: PRIMARY_TARGET[order.status],
    restockUnits: order.items.reduce((s, it) => s + it.quantity - (it.returnedQty ?? 0), 0),
  };
}

/** initialAction="received" открывает «Посылка вернулась» только пока посылка едет назад. */
export function receivedAllowed(order: Pick<RuleOrder, "admin">): boolean {
  return order.admin?.returnStatus === "IN_TRANSIT";
}
