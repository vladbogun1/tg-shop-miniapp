import { describe, expect, it } from "vitest";
import { costUahMinor, fxToInput, inputToFx, isOpenStatus, lineTitle } from "./batch";
import { validateBatchForm, type BatchFormValues } from "./batch-form";
import { inputToMinor, minorToInput } from "./costing";
import { demandOfProduct, peopleOfRows, releaseSummary, sumReleases } from "./demand";
import type { Demand } from "./types";

const row = (over: Partial<Demand>): Demand => ({ productId: "p1", variantId: null, people: 0, units: 0, productPeople: null, ...over }) as Demand;

describe("суммы закупки", () => {
  it("inputToMinor понимает запятую и пробелы, пусто и мусор — null", () => {
    expect(inputToMinor("95,5")).toBe(9550);
    expect(inputToMinor(" 1 200.25 ")).toBe(120025);
    expect(inputToMinor("")).toBeNull();
    expect(inputToMinor("abc")).toBeNull();
    expect(minorToInput(9550)).toBe("95.50");
    expect(minorToInput(null)).toBe("");
  });

  it("цена в валюте: центы <-> поле ввода, отрицательная не принимается", () => {
    expect(inputToFx("95,5")).toBe(9550);
    expect(inputToFx("-1")).toBeNull();
    expect(fxToInput(9550)).toBe("95.50");
  });

  it("costUahMinor: центы валюты на курс, без курса — null", () => {
    expect(costUahMinor(1000, 41.5)).toBe(41500);
    expect(costUahMinor(1000, null)).toBeNull();
    expect(costUahMinor(1000, 0)).toBeNull();
  });
});

describe("поставки", () => {
  it("открытые статусы и подпись позиции", () => {
    expect(isOpenStatus("ORDERED")).toBe(true);
    expect(isOpenStatus("ARRIVED")).toBe(false);
    expect(lineTitle("Мышь", "чёрная")).toBe("Мышь · чёрная");
    expect(lineTitle("Мышь", null)).toBe("Мышь");
  });
});

describe("«Чего ждут»", () => {
  it("люди по товару не считаются дважды по вариантам", () => {
    const rows = [row({ people: 3, units: 3, productPeople: 4 }), row({ variantId: "v", people: 2, units: 2, productPeople: 4 })];
    expect(peopleOfRows(rows)).toBe(4);
    expect(peopleOfRows([row({ people: 3 }), row({ people: 2 })])).toBe(5);
    expect(demandOfProduct(rows, "p1")).toEqual({ people: 4, units: 5 });
    expect(demandOfProduct(rows, "other")).toBeNull();
    expect(demandOfProduct(undefined, "p1")).toBeNull();
  });

  it("раздача броней: суммирование и сообщение", () => {
    const sum = sumReleases([
      { heldPeople: 2, heldQty: 3, shortPeople: 1, freeAfter: 0 },
      { heldPeople: 1, heldQty: 1, shortPeople: 0, freeAfter: 4 },
    ]);
    expect(sum).toEqual({ heldPeople: 3, heldQty: 4, shortPeople: 1, freeAfter: 4 });
    expect(releaseSummary(sum)).toBe("Бронь получили 3 чел (4 шт), не хватило 1 чел");
    expect(releaseSummary(sumReleases([]))).toBe("Бронь никому не ушла: свободных штук нет");
  });
});

describe("форма поставки: проверка", () => {
  const base = {
    lines: [{ key: "a", id: null, productId: "p", variantId: null, title: "t", variantName: null, imageUrl: null, qty: "2", price: "" }],
    etaMode: "NONE",
    etaFrom: "",
    etaTo: "",
    weeks: "",
    fxRate: "",
  } as unknown as BatchFormValues;

  it("нужна позиция и количество от 1", () => {
    expect(validateBatchForm({ ...base, lines: [] }, false, false)).toBe("Добавьте хотя бы одну позицию");
    expect(validateBatchForm({ ...base, lines: [{ ...base.lines[0], qty: "0" }] }, false, false)).toBe("Сколько заказано — от 1 у каждой позиции");
    expect(validateBatchForm({ ...base, lines: [] }, true, false)).toBeNull();
  });

  it("срок и курс", () => {
    expect(validateBatchForm({ ...base, etaMode: "DATE" }, false, false)).toBe("Укажите дату");
    expect(validateBatchForm({ ...base, etaMode: "RANGE", etaFrom: "2026-10-10", etaTo: "2026-10-01" }, false, false)).toBe("Диапазон: «с» не позже «по»");
    expect(validateBatchForm({ ...base, fxRate: "0" }, false, true)).toBe("Курс должен быть больше нуля");
    expect(validateBatchForm({ ...base, fxRate: "41,5" }, false, true)).toBeNull();
  });
});
