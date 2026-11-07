import { describe, expect, it } from "vitest";
import type { OrderAdminExtras } from "../api";
import { actionPlan } from "./action-plan";
import { drawerRules, type RuleOrder } from "./drawer-rules";

const order = (
  over: Omit<Partial<RuleOrder>, "admin"> & {
    admin?: Partial<OrderAdminExtras>;
  },
): RuleOrder =>
  ({
    status: "NEW",
    receivedMinor: 0,
    refundedMinor: 0,
    totalMinor: 10000,
    items: [],
    ...over,
    admin: { ...over.admin } as OrderAdminExtras,
  }) as RuleOrder;

const plan = (o: RuleOrder, isSuper = false, canMerge = false) => actionPlan(drawerRules(o, isSuper), canMerge);
const keys = (p: ReturnType<typeof actionPlan>) => p.groups.flatMap((g) => g.keys);

describe("actionPlan: матрица статус → действия", () => {
  it("Новый: главное «Одобрить», «Отклонить» отдельно, «Отправить» мимо главного — в меню", () => {
    const p = plan(order({ status: "NEW" }));
    expect(p.primary).toBe("status:APPROVED");
    expect(p.reject).toBe(true);
    expect(keys(p)).toEqual(["pay", "status:SHIPPED", "status:REJECTED"]);
  });

  it("Новый с кандидатом на слияние и переплатой: объединить и возврат", () => {
    const p = plan(order({ status: "NEW", receivedMinor: 12000 }), false, true);
    expect(keys(p)).toContain("merge");
    expect(keys(p)).toContain("return");
    expect(keys(p)).not.toContain("exchange");
  });

  it("Отправлен: главное «Доставлен», возврат в «Деньгах»", () => {
    const p = plan(order({ status: "SHIPPED" }));
    expect(p.primary).toBe("status:DELIVERED");
    expect(p.groups[0]).toEqual({
      id: "money",
      title: "Деньги",
      keys: ["pay", "return"],
    });
    expect(keys(p)).not.toContain("archive");
  });

  it("Доставлен: главное «Оформить возврат», обмен и архив (только главному админу)", () => {
    const d = order({ status: "DELIVERED" });
    const regular = plan(d);
    expect(regular.primary).toBe("return");
    expect(keys(regular)).toEqual(["pay", "exchange"]);
    expect(regular.reject).toBe(false);
    expect(keys(plan(d, true))).toEqual(["pay", "exchange", "archive"]);
  });

  it("Отклонён без остатка к возврату: главное «Написать клиенту»", () => {
    const p = plan(order({ status: "REJECTED", receivedMinor: 5000, refundedMinor: 5000 }));
    expect(p.primary).toBe("chat");
    expect(keys(p)).toEqual(["pay"]);
  });

  it("Посылка едет назад: главное «Посылка вернулась», в меню её нет", () => {
    const p = plan(order({ status: "REJECTED", admin: { returnStatus: "IN_TRANSIT" } }));
    expect(p.primary).toBe("received");
    expect(keys(p)).not.toContain("received");
  });

  it("Архив: «Вернуть из архива» только главному админу", () => {
    const a = order({
      status: "DELIVERED",
      admin: { archivedAt: "2026-10-01T00:00:00Z" },
    });
    expect(keys(plan(a))).not.toContain("unarchive");
    expect(keys(plan(a, true))).toEqual(["pay", "exchange", "unarchive"]);
  });
});
