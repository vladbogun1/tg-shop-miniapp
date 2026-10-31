import { describe, expect, it } from "vitest";
import type { OrderAdminExtras } from "../api";
import { canExchange, canReturn, drawerRules, isMergeable, needsModal, receivedAllowed, type RuleOrder } from "./drawer-rules";

const adm = (a: Partial<OrderAdminExtras>) => a as OrderAdminExtras;
const order = (over: Partial<RuleOrder>): RuleOrder =>
  ({ status: "NEW", receivedMinor: 0, refundedMinor: 0, totalMinor: 10000, admin: adm({}), items: [], ...over }) as RuleOrder;

describe("canReturn", () => {
  it("отправленный и доставленный — можно", () => {
    expect(canReturn(order({ status: "SHIPPED" }))).toBe(true);
    expect(canReturn(order({ status: "DELIVERED" }))).toBe(true);
  });
  it("отклонённый — только если есть что вернуть деньгами", () => {
    expect(canReturn(order({ status: "REJECTED", receivedMinor: 5000, refundedMinor: 5000 }))).toBe(false);
    expect(canReturn(order({ status: "REJECTED", receivedMinor: 5000, refundedMinor: 1000 }))).toBe(true);
  });
  it("новый/одобренный — только переплата после обмена на более дешёвое", () => {
    expect(canReturn(order({ status: "NEW", receivedMinor: 10000 }))).toBe(false);
    expect(canReturn(order({ status: "APPROVED", receivedMinor: 12000 }))).toBe(true);
    expect(canReturn(order({ status: "APPROVED", receivedMinor: 12000, refundedMinor: 2000 }))).toBe(false);
  });
});

describe("canExchange / isMergeable", () => {
  it("обмен — только доставленный", () => {
    expect(canExchange({ status: "DELIVERED" })).toBe(true);
    expect(canExchange({ status: "SHIPPED" })).toBe(false);
  });
  it("слияние — неотправленный и не в архиве", () => {
    expect(isMergeable(order({ status: "NEW" }))).toBe(true);
    expect(isMergeable(order({ status: "APPROVED", admin: adm({ archivedAt: "2026-10-01T00:00:00Z" }) }))).toBe(false);
    expect(isMergeable(order({ status: "SHIPPED" }))).toBe(false);
  });
});

describe("drawerRules", () => {
  it("архив — только главному админу и только закрытому заказу", () => {
    const done = order({ status: "DELIVERED" });
    expect(drawerRules(done, true).canArchive).toBe(true);
    expect(drawerRules(done, false).canArchive).toBe(false);
    expect(drawerRules(order({ status: "SHIPPED" }), true).canArchive).toBe(false);
  });
  it("из архива возвращает главный админ", () => {
    const archived = order({ status: "DELIVERED", admin: adm({ archivedAt: "2026-10-01T00:00:00Z" }) });
    const r = drawerRules(archived, true);
    expect(r.canUnarchive).toBe(true);
    expect(r.canArchive).toBe(false);
    expect(drawerRules(archived, false).canUnarchive).toBe(false);
  });
  it("главная кнопка телефона — следующий шаг", () => {
    expect(drawerRules(order({ status: "NEW" }), false).primary).toBe("APPROVED");
    expect(drawerRules(order({ status: "DELIVERED" }), false).primary).toBeUndefined();
  });
  it("доставленный не отклоняют: цели не содержат REJECTED", () => {
    expect(drawerRules(order({ status: "DELIVERED" }), false).targets).not.toContain("REJECTED");
  });
  it("на склад вернётся то, что не возвращали раньше", () => {
    const r = drawerRules(order({ items: [{ quantity: 3, returnedQty: 1 }, { quantity: 2 }] as RuleOrder["items"] }), false);
    expect(r.restockUnits).toBe(4);
  });
  it("без заказа — всё выключено", () => {
    const r = drawerRules(undefined, true);
    expect([r.canArchive, r.canReturn, r.canExchange, r.mergeable, r.inTransit]).toEqual([false, false, false, false, false]);
    expect(r.targets).toEqual([]);
  });
});

describe("needsModal / receivedAllowed", () => {
  it("модалка нужна для отправки, отказа и доставки", () => {
    expect(needsModal("SHIPPED")).toBe(true);
    expect(needsModal("REJECTED")).toBe(true);
    expect(needsModal("DELIVERED")).toBe(true);
    expect(needsModal("APPROVED")).toBe(false);
  });
  it("«Посылка вернулась» — пока едет назад", () => {
    expect(receivedAllowed({ admin: adm({ returnStatus: "IN_TRANSIT" }) })).toBe(true);
    expect(receivedAllowed({ admin: adm({ returnStatus: "RECEIVED" }) })).toBe(false);
  });
});
