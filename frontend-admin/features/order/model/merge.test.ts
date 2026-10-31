import { describe, expect, it } from "vitest";
import { defaultKeepThis, mergeAddress, mergePreview, mergeView, mustStay } from "./merge";

describe("mustStay", () => {
  it("закрытый кейс важнее ТТН", () => {
    expect(mustStay({ giftCaseStatus: "SEALED", trackingNumber: "1" })).toBe("в нём не открыт кейс");
    expect(mustStay({ trackingNumber: "20450000000000" })).toBe("у него уже есть ТТН");
    expect(mustStay({})).toBeNull();
  });
});

describe("mergePreview", () => {
  it("без предоплаты онлайн нужно всё, что ещё не оплачено", () => {
    expect(mergePreview(30000, 10000, 0)).toEqual({ total: 30000, received: 10000, due: 20000, cod: 0 });
  });
  it("предоплата ограничена суммой, остаток — наложкой", () => {
    expect(mergePreview(30000, 0, 5000)).toEqual({ total: 30000, received: 0, due: 5000, cod: 25000 });
    expect(mergePreview(3000, 0, 5000)).toEqual({ total: 3000, received: 0, due: 3000, cod: 0 });
  });
  it("переплата не уходит в минус", () => {
    expect(mergePreview(10000, 15000, 0)).toEqual({ total: 10000, received: 15000, due: 0, cod: 0 });
  });
});

describe("defaultKeepThis", () => {
  const old = { createdAt: "2026-10-01T10:00:00Z" };
  const fresh = { createdAt: "2026-10-02T10:00:00Z" };
  it("остаётся более старый", () => {
    expect(defaultKeepThis(old, fresh)).toBe(true);
    expect(defaultKeepThis(fresh, old)).toBe(false);
  });
  it("заказ с ТТН/кейсом остаётся, даже если новее", () => {
    expect(defaultKeepThis(old, { ...fresh, trackingNumber: "1" })).toBe(false);
    expect(defaultKeepThis({ ...fresh, giftCaseStatus: "SEALED" }, old)).toBe(true);
  });
});

describe("mergeAddress", () => {
  it("склеивает непустое", () => {
    expect(mergeAddress({ customerName: "Иван", npCityName: null, npWarehouseName: "№5" })).toBe("Иван, №5");
  });
});

describe("mergeView", () => {
  const a = { totalMinor: 1000, receivedMinor: 300, prepaymentMinor: 500, customerName: "Иван", npCityName: "Харьков" };
  const b = { totalMinor: 2000, receivedMinor: 0, prepaymentMinor: null, customerName: "Иван", npCityName: "Харьков", blocker: null };
  it("без второго заказа — пусто", () => {
    expect(mergeView(a, null, true)).toMatchObject({ target: null, result: null, ready: false });
  });
  it("остаётся этот: предоплата этого, адрес совпал", () => {
    const v = mergeView(a, b, true);
    expect(v.target).toBe(a);
    expect(v.source).toBe(b);
    expect(v.sameAddress).toBe(true);
    expect(v.result).toEqual(mergePreview(3000, 300, 500));
    expect(v.ready).toBe(true);
  });
  it("остаётся второй: предоплата второго (нет — 0)", () => {
    const v = mergeView(a, b, false);
    expect(v.target).toBe(b);
    expect(v.result).toEqual(mergePreview(3000, 300, 0));
  });
  it("блокировка или обязанность остаться — нельзя", () => {
    expect(mergeView(a, { ...b, blocker: "x" }, true).ready).toBe(false);
    expect(mergeView(a, { ...b, trackingNumber: "1" }, true).ready).toBe(false);
    expect(mergeView({ ...a, trackingNumber: "1" }, b, true).ready).toBe(true);
    expect(mergeView({ ...a, trackingNumber: "1" }, b, false).ready).toBe(false);
  });
});
