import { describe, expect, it } from "vitest";
import { batchScope, isPrintable, isUnconfirmed, pickBranch } from "./batch";

const np = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  deliveryMethod: "NOVA_POSHTA" as const,
  shipmentStage: null,
  shipmentOrigin: null,
  shipmentStaleReasons: [] as string[],
  ...extra,
});

describe("isPrintable", () => {
  it("своя живая ТТН — да", () => {
    expect(isPrintable(np("a", { shipmentOrigin: "API", shipmentStage: "CREATED" }))).toBe(true);
  });
  it("введённая вручную, отменённая или устаревшая — нет", () => {
    expect(isPrintable(np("a", { shipmentOrigin: "MANUAL", shipmentStage: "CREATED" }))).toBe(false);
    expect(isPrintable(np("a", { shipmentOrigin: "API", shipmentStage: "CANCELLED" }))).toBe(false);
    expect(isPrintable(np("a", { shipmentOrigin: "API", shipmentStage: "CREATED", shipmentStaleReasons: ["вес"] }))).toBe(false);
  });
});

describe("batchScope", () => {
  const list = [
    np("a"),
    np("b", { shipmentOrigin: "API", shipmentStage: "CREATED" }),
    np("c", { shipmentOrigin: "API", shipmentStage: "CREATED", shipmentStaleReasons: ["адрес"] }),
    { ...np("p"), deliveryMethod: "PICKUP" as const },
  ];
  it("без галочек — все показанные заказы НП", () => {
    const s = batchScope(list, new Set());
    expect(s.np.map((o) => o.id)).toEqual(["a", "b", "c"]);
    expect(s.toCreate.map((o) => o.id)).toEqual(["a"]);
    expect(s.toPrint.map((o) => o.id)).toEqual(["b"]);
    expect(s.staleCount).toBe(1);
  });
  it("с галочками — только отмеченные; самовывоз не попадает", () => {
    const s = batchScope(list, new Set(["b", "p"]));
    expect(s.selected.map((o) => o.id)).toEqual(["b"]);
    expect(s.toCreate).toEqual([]);
    expect(s.toPrint.map((o) => o.id)).toEqual(["b"]);
  });
});

describe("коробка не подтверждена", () => {
  const printed = (id: string, unconfirmed: boolean) =>
    np(id, { shipmentOrigin: "API", shipmentStage: "CREATED", shipmentPacking: { unconfirmed } });
  it("печать: все и только подтверждённые", () => {
    const s = batchScope([printed("a", true), printed("b", false), np("c", { shipmentOrigin: "API", shipmentStage: "CREATED" })], new Set());
    expect(s.toPrint.map((o) => o.id)).toEqual(["a", "b", "c"]);
    expect(s.toPrintConfirmed.map((o) => o.id)).toEqual(["b", "c"]);
  });
  it("без блока упаковки — не считаем неподтверждённым", () => {
    expect(isUnconfirmed(np("x"))).toBe(false);
    expect(isUnconfirmed(printed("y", true))).toBe(true);
  });
});

describe("pickBranch", () => {
  const branches = [{ ref: "65" }, { ref: "104" }];
  it("выбранное вручную", () => expect(pickBranch("104", branches, "65")).toBe("104"));
  it("пропавшее — по умолчанию", () => expect(pickBranch("x", branches, "65")).toBe("65"));
  it("без умолчания — первое", () => expect(pickBranch(null, branches, null)).toBe("65"));
});
