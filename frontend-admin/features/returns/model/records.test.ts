import { describe, expect, it } from "vitest";
import { ledgerSign, ledgerTone, ledgerTotals, sumByKind } from "./ledger";
import { buildReceivedBody, travelling } from "./received";
import { givenBack, lineDone, lineUndo } from "./records";
import type { OrderMovement, ReturnOrder, ReturnRecord, ReturnRecordLine } from "./types";

const line = (over: Partial<ReturnRecordLine>): ReturnRecordLine =>
  ({
    itemId: 1,
    title: "Мышь",
    quantity: 2,
    outcome: "IN_TRANSIT",
    pendingQty: 0,
    restockedQty: 0,
    defectQty: 0,
    ...over,
  }) as ReturnRecordLine;

describe("история возвратов", () => {
  it("lineDone: простые исходы и смешанный «едет назад»", () => {
    expect(lineDone(line({ outcome: "KEPT" }))).toBe("оставили покупателю");
    expect(lineDone(line({ outcome: "RESTOCK" }))).toBe("вернулся на склад");
    expect(lineDone(line({ outcome: "DEFECT" }))).toBe("брак, списан");
    expect(lineDone(line({ pendingQty: 1, restockedQty: 1, defectQty: 1 }))).toBe(
      "едет назад: 1 · на склад: 1 · брак: 1",
    );
    expect(lineDone(line({}))).toBe("отправил почтой");
  });
  it("lineUndo: что вернёт отмена; у покупателя — ничего", () => {
    expect(lineUndo(line({ outcome: "KEPT" }))).toBeNull();
    expect(lineUndo(line({ pendingQty: 1, restockedQty: 2, defectQty: 3 }))).toBe(
      "1 шт ещё в пути — просто вернутся в заказ, 2 шт заберём со склада, 3 шт уберём из брака",
    );
  });
  it("givenBack не больше, чем реально вернули по заказу", () => {
    const rec = { refundMinor: 3000, monoRefundMinor: 2000 } as ReturnRecord;
    expect(givenBack(rec, { refundedMinor: 5000 } as ReturnOrder)).toBe(5000);
    expect(givenBack(rec, { refundedMinor: 1000 } as ReturnOrder)).toBe(1000);
    expect(givenBack(rec, {} as ReturnOrder)).toBe(5000);
  });
});

const mv = (over: Partial<OrderMovement>): OrderMovement =>
  ({ id: 1, kind: "PAYMENT", channel: "CASH", amountMinor: 1000, source: "MANUAL", ...over }) as OrderMovement;

describe("журнал денег", () => {
  const rows = [
    mv({ id: 1, kind: "PAYMENT", amountMinor: 10000 }),
    mv({ id: 2, kind: "CORRECTION", amountMinor: -500 }),
    mv({ id: 3, kind: "REFUND", amountMinor: 2000 }),
    mv({ id: 4, kind: "REFUND", amountMinor: -300 }),
  ];
  it("итоги: получено = оплаты + поправки, возвращено — по возвратам", () => {
    expect(sumByKind(rows, "PAYMENT")).toBe(10000);
    expect(ledgerTotals(rows, { admin: {} } as ReturnOrder)).toEqual({ paid: 9500, refunded: 1700, retained: 0 });
  });
  it("удержано: из журнала, иначе из итога заказа", () => {
    const withRetained = [...rows, mv({ id: 5, kind: "RETAINED", amountMinor: 700 })];
    expect(ledgerTotals(withRetained, { admin: { retainedMinor: 900 } } as ReturnOrder).retained).toBe(700);
    expect(ledgerTotals(rows, { admin: { retainedMinor: 900 } } as ReturnOrder).retained).toBe(900);
  });
  it("цвет и знак суммы", () => {
    expect(ledgerTone(mv({ source: "BACKFILL" }))).toBe("faint");
    expect(ledgerTone(mv({ kind: "PAYMENT" }))).toBe("ok");
    expect(ledgerTone(mv({ kind: "REFUND", amountMinor: -300 }))).toBe("ok");
    expect(ledgerTone(mv({ kind: "REFUND", amountMinor: 300 }))).toBe("danger");
    expect(ledgerTone(mv({ kind: "RETAINED" }))).toBe("text");
    expect(ledgerTone(mv({ kind: "CORRECTION", amountMinor: -5 }))).toBe("danger");
    expect(ledgerSign(mv({ kind: "PAYMENT" }))).toBe("+");
    expect(ledgerSign(mv({ kind: "REFUND", amountMinor: -300 }))).toBe("+");
    expect(ledgerSign(mv({ kind: "REFUND", amountMinor: 300 }))).toBe("−");
    expect(ledgerSign(mv({ kind: "CORRECTION" }))).toBe("");
  });
});

describe("«Посылка вернулась»", () => {
  const item = (over: object) =>
    ({ id: 1, quantity: 3, returnedQty: 0, returnPendingQty: 0, ...over }) as ReturnOrder["items"][number];
  const ord = (status: string, items: ReturnOrder["items"]) => ({ status, items }) as ReturnOrder;

  it("едет назад ровно то, что отмечено «в пути»", () => {
    const o = ord("DELIVERED", [item({ returnPendingQty: 2 }), item({ id: 2 })]);
    expect(travelling(o, o.items[0])).toBe(2);
    expect(travelling(o, o.items[1])).toBe(0);
  });
  it("отказная посылка без учёта по строкам едет целиком", () => {
    const o = ord("REJECTED", [item({ returnedQty: 1 })]);
    expect(travelling(o, o.items[0])).toBe(2);
    expect(travelling(ord("DELIVERED", [item({})]), item({}))).toBe(0);
  });
  it("всё кроме брака — на полку, брак ограничен количеством", () => {
    const o = ord("DELIVERED", [item({ returnPendingQty: 3 })]);
    expect(buildReceivedBody(o, o.items, { 1: 1 }, " ok ")).toEqual({
      lines: [
        { itemId: 1, quantity: 2, outcome: "RESTOCK" },
        { itemId: 1, quantity: 1, outcome: "DEFECT" },
      ],
      note: "ok",
    });
    expect(buildReceivedBody(o, o.items, { 1: 9 }, "").lines).toEqual([{ itemId: 1, quantity: 3, outcome: "DEFECT" }]);
  });
});
