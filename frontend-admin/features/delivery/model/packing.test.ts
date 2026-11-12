import { describe, expect, it } from "vitest";
import { boxSizeText, choiceByLabel, choiceLabel, cm, confirmBody, confirmMessage, npHasParcel, ownBoxBody, remeasureText } from "./packing";
import type { NpBox } from "./types";

const npBox = (over: Partial<NpBox>): NpBox => ({
  id: "b5",
  code: "np-5",
  name: "Коробка 5 кг",
  kind: "BOX",
  lengthMm: 400,
  widthMm: 240,
  heightsMm: [200, 130, 80],
  tareG: 200,
  packMinor: 4000,
  packEstimated: false,
  inStock: true,
  own: false,
  sortOrder: 1,
  options: [
    { heightMm: 200, label: "Коробка 5 кг", full: true },
    { heightMm: 130, label: "Коробка 5 кг · 13 см", full: false },
    { heightMm: 80, label: "Коробка 5 кг · 8 см", full: false },
  ],
  ...over,
});
const bag = npBox({ id: "bag", code: "np-bag-1", name: "Пакет фирменный 1 кг", kind: "BAG", lengthMm: 360, widthMm: 250, heightsMm: [], options: [] });
const boxes = [npBox({}), bag];

describe("коробки", () => {
  it("размеры в см", () => {
    expect(cm(285)).toBe("28,5");
    expect(boxSizeText(npBox({}))).toBe("40×24 · высота 20/13/8");
    expect(boxSizeText(bag)).toBe("36×25 · пакет");
  });
  it("совет сервера → коробка и высота", () => {
    expect(choiceByLabel(boxes, "Коробка 5 кг · 13 см")).toEqual({ kind: "box", boxId: "b5", heightMm: 130 });
    expect(choiceByLabel(boxes, "Коробка 5 кг")).toEqual({ kind: "box", boxId: "b5", heightMm: 200 });
    expect(choiceByLabel(boxes, "Пакет фирменный 1 кг")).toEqual({ kind: "box", boxId: "bag", heightMm: null });
    expect(choiceByLabel(boxes, "Коробка 5 кг + Пакет фирменный 1 кг")).toBeNull();
  });
  it("подпись выбора", () => {
    expect(choiceLabel(boxes, { kind: "box", boxId: "b5", heightMm: 80 })).toBe("Коробка 5 кг · 8 см");
    expect(choiceLabel(boxes, { kind: "custom", name: "", l: "40", w: "24", h: "9,5", save: false })).toBe("Своя коробка 40×24×9,5 см");
  });
});

describe("«Упаковано»", () => {
  it("коробка из списка; пустой вес не уходит", () => {
    expect(confirmBody({ kind: "box", boxId: "b5", heightMm: 130 }, "")).toEqual({ boxId: "b5", heightMm: 130, weightG: undefined });
    expect(confirmBody({ kind: "box", boxId: "bag", heightMm: null }, "750")).toEqual({ boxId: "bag", heightMm: undefined, weightG: 750 });
  });
  it("свои размеры — в мм; неполные — null", () => {
    expect(confirmBody({ kind: "custom", name: " Короб ", l: "45", w: "15", h: "5", save: true }, "")).toEqual({
      custom: { name: "Короб", lengthMm: 450, widthMm: 150, heightMm: 50, saveAsBox: true },
      weightG: undefined,
    });
    expect(confirmBody({ kind: "custom", name: "", l: "45", w: "", h: "5", save: false }, "")).toBeNull();
  });
  it("тост: заменена, обновлена, только записали", () => {
    const sh = { ttn: "2045" };
    expect(confirmMessage({ ttnUpdated: true, ttnNumberChanged: true, shipment: sh }, "2044")).toBe("Коробка подтверждена, ТТН №2044 заменена на №2045");
    expect(confirmMessage({ ttnUpdated: true, ttnNumberChanged: false, shipment: sh }, "2045")).toBe("Коробка подтверждена, ТТН обновлена");
    expect(confirmMessage({ ttnUpdated: false, ttnNumberChanged: false, shipment: sh }, "2045")).toBe("НП уже приняла — записали для статистики");
  });
  it("НП приняла с кода 4", () => {
    expect(npHasParcel("1")).toBe(false);
    expect(npHasParcel("4")).toBe(true);
    expect(npHasParcel("101")).toBe(true);
    expect(npHasParcel(null)).toBe(false);
  });
});

describe("перемер НП", () => {
  const measured = { npWeightG: 5000, npVolumeWeightG: 5000, npFactualWeightG: 1800, npCostMinor: 19550, npMeasuredAt: "2026-11-12T10:00:00Z" };
  const ours = { weightG: 1900, lengthMm: 200, widthMm: 150, heightMm: 100, deliveryCostMinor: 11050 };
  it("не мерила — нет строки", () => {
    expect(remeasureText({ ...measured, npMeasuredAt: null }, ours)).toBeNull();
  });
  it("объёмный вес и цена, отличие > 15 %", () => {
    const r = remeasureText(measured, ours);
    expect(r?.text).toMatch(/^НП перемеряла: 5 кг \(объёмный\), 195,50.*₴ — у нас было 1,9 кг, 110,50.*₴$/);
    expect(r?.differs).toBe(true);
  });
  it("в пределах 15 % — не подсвечиваем", () => {
    const r = remeasureText({ ...measured, npWeightG: 2000, npVolumeWeightG: 500, npCostMinor: 11050 }, ours);
    expect(r?.text).not.toContain("объёмный");
    expect(r?.differs).toBe(false);
  });
});

describe("своя коробка", () => {
  it("мм, полная высота первой, линии по убыванию без повторов и не выше полной", () => {
    expect(ownBoxBody({ name: " Короб ", l: "45", w: "15", h: "20", folds: "8, 13; 13 25 8,5" })).toEqual({
      name: "Короб",
      kind: "BOX",
      lengthMm: 450,
      widthMm: 150,
      heightsMm: [200, 130, 85, 80],
      inStock: true,
    });
  });
  it("без имени или сторон — null", () => {
    expect(ownBoxBody({ name: "", l: "45", w: "15", h: "20", folds: "" })).toBeNull();
    expect(ownBoxBody({ name: "x", l: "45", w: "", h: "20", folds: "" })).toBeNull();
  });
});
