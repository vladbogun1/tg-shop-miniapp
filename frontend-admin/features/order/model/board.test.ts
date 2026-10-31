import { describe, expect, it } from "vitest";
import type { AdminBoard, AdminOrderCard } from "../api";
import { canDrop, columnTotal, findCard, isClosedColumn, moveCard, moveVerdict, onlyPaidNew, parseBoardLink, returningTotals, sendBackPlan } from "./board";

const card = (id: string, status: string, extra: Record<string, unknown> = {}) =>
  ({ id, status, totalMinor: 1000, paid: false, ...extra }) as unknown as AdminOrderCard;

function board(): AdminBoard {
  return {
    columns: { NEW: [card("a", "NEW", { paid: true }), card("b", "NEW")], APPROVED: [], SHIPPED: [card("c", "SHIPPED")], DELIVERED: [], REJECTED: [] },
    counts: { NEW: 2, APPROVED: 0, SHIPPED: 1, DELIVERED: 0, REJECTED: 0 },
    sums: { NEW: 2000, APPROVED: 0, SHIPPED: 1000, DELIVERED: 0, REJECTED: 0 },
  } as unknown as AdminBoard;
}

describe("moveVerdict", () => {
  it("отправка, отказ и доставка идут через окно, остальное — сразу", () => {
    expect(moveVerdict("NEW", "APPROVED")).toEqual({ kind: "commit" });
    expect(moveVerdict("APPROVED", "SHIPPED")).toEqual({ kind: "modal" });
    expect(moveVerdict("SHIPPED", "DELIVERED")).toEqual({ kind: "modal" });
  });

  it("доставленный в «Отклонён» — отказ с подсказкой про возврат", () => {
    const v = moveVerdict("DELIVERED", "REJECTED");
    expect(v.kind).toBe("refuse");
    expect(v.kind === "refuse" && v.text).toContain("Возврат");
  });
});

describe("canDrop / sendBackPlan", () => {
  it("на «Едет назад» — только отправленный или доставленный", () => {
    expect(canDrop(card("x", "SHIPPED"), "RETURNING")).toBe(true);
    expect(canDrop(card("x", "NEW"), "RETURNING")).toBe(false);
    expect(canDrop(undefined, "NEW")).toBe(false);
  });

  it("отправленный → отказ «едет назад», доставленный → мастер возврата, прочие — отказ", () => {
    expect(sendBackPlan("SHIPPED", true)).toBe("reject-in-transit");
    expect(sendBackPlan("SHIPPED", false)).toBe("refuse");
    expect(sendBackPlan("DELIVERED", false)).toBe("return");
    expect(sendBackPlan("NEW", true)).toBe("refuse");
  });
});

describe("moveCard", () => {
  it("переносит карточку, пересчитывает счётчики и суммы, исходную доску не трогает", () => {
    const prev = board();
    const next = moveCard(prev, "b", "APPROVED");
    expect(next?.columns.APPROVED.map((o) => o.id)).toEqual(["b"]);
    expect(next?.columns.APPROVED[0]?.status).toBe("APPROVED");
    expect(next?.counts).toMatchObject({ NEW: 1, APPROVED: 1 });
    expect(next?.sums).toMatchObject({ NEW: 1000, APPROVED: 1000 });
    expect(prev.columns.NEW).toHaveLength(2);
  });

  it("нет карточки — null", () => {
    expect(moveCard(board(), "zzz", "APPROVED")).toBeNull();
  });
});

describe("onlyPaidNew / findCard / колонки", () => {
  it("оставляет оплаченные новые, считает счётчики и сбрасывает суммы", () => {
    const b = onlyPaidNew(board());
    expect(b.columns.NEW.map((o) => o.id)).toEqual(["a"]);
    expect(b.columns.SHIPPED).toEqual([]);
    expect(b.counts).toMatchObject({ NEW: 1, SHIPPED: 0 });
    expect(b.sums).toBeUndefined();
  });

  it("findCard ищет по всем колонкам", () => {
    expect(findCard(board(), "c")?.status).toBe("SHIPPED");
    expect(findCard(board(), null)).toBeUndefined();
  });

  it("закрытые колонки — «Доставлен» и «Отклонён»", () => {
    expect(isClosedColumn("DELIVERED")).toBe(true);
    expect(isClosedColumn("REJECTED")).toBe(true);
    expect(isClosedColumn("RETURNING")).toBe(false);
    expect(isClosedColumn("NEW")).toBe(false);
  });

  it("сумма колонки: серверная, а без неё — по карточкам", () => {
    const orders = [card("a", "NEW"), card("b", "NEW")];
    expect(columnTotal(orders, 5000)).toBe(5000);
    expect(columnTotal(orders)).toBe(2000);
  });

  it("итоги «Едет назад»", () => {
    const orders = [
      card("a", "SHIPPED", { returningUnits: 2, lines: [{ returningMinor: 300 }, { returningMinor: 200 }] }),
      card("b", "SHIPPED", { returningUnits: 1, lines: [{ returningMinor: 100 }] }),
    ];
    expect(returningTotals(orders)).toEqual({ units: 3, minor: 600 });
  });
});

describe("parseBoardLink", () => {
  it("?status=NEW открывает вкладку, ?payment=paid и старое claimed — «оплаченные новые»", () => {
    expect(parseBoardLink("?status=NEW")).toEqual({ tab: "NEW", paidNewOnly: false });
    expect(parseBoardLink("?payment=paid")).toEqual({ tab: undefined, paidNewOnly: true });
    expect(parseBoardLink("?payment=claimed&status=SHIPPED")).toEqual({ tab: "SHIPPED", paidNewOnly: true });
  });

  it("неизвестный статус игнорируется", () => {
    expect(parseBoardLink("?status=BOGUS").tab).toBeUndefined();
  });
});
