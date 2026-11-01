import { describe, expect, it } from "vitest";
import { STATUS_ORDER } from "@shop/core/orders";
import { CLOSED_STATUSES, STATUS_META, TIMELINE_STATUSES, isOrderStatus, needsModal, statusTimestamp } from "./status";

describe("STATUS_META", () => {
  it("knows every status the shared list knows", () => {
    expect(Object.keys(STATUS_META).sort()).toEqual([...STATUS_ORDER].sort());
  });

  it("keeps the behaviour the scattered lists had", () => {
    expect(STATUS_ORDER.filter(needsModal)).toEqual(["SHIPPED", "DELIVERED", "REJECTED"]);
    expect(TIMELINE_STATUSES).toEqual(["NEW", "APPROVED", "SHIPPED", "DELIVERED"]);
    expect(CLOSED_STATUSES).toEqual(["DELIVERED", "REJECTED"]);
  });

  it("recognises only real statuses", () => {
    expect(isOrderStatus("SHIPPED")).toBe(true);
    expect(isOrderStatus("RETURNING")).toBe(false);
    expect(isOrderStatus("toString")).toBe(false);
  });

  it("reads the time of entering a status from the card", () => {
    const order = { createdAt: "c", approvedAt: "a", shippedAt: null, deliveredAt: undefined, rejectedAt: "r" };
    expect(statusTimestamp(order, "APPROVED")).toBe("a");
    expect(statusTimestamp(order, "SHIPPED")).toBeNull();
    expect(statusTimestamp(order, "REJECTED")).toBe("r");
  });
});
