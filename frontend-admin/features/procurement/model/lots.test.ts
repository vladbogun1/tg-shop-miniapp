import { describe, expect, it } from "vitest";
import {
  answerCost,
  batchLineLabel,
  batchLinesOf,
  fxLine,
  lotMargin,
  lotName,
  lotSourceProblem,
  lotSourceRequest,
  lotSourceSummary,
  shelfLots,
  stockSummary,
} from "./lots";
import type { BatchLineOption, Lot } from "./types";

let id = 0;
const lot = (over: Partial<Lot>): Lot =>
  ({
    id: ++id,
    kind: "OPENING",
    qtyIn: 1,
    qtyLeft: 1,
    unitCostMinor: null,
    variantId: null,
    batchId: null,
    ...over,
  }) as Lot;

describe("склад по партиям", () => {
  // Пример из макета: 5 старых без закупки, 1 из №2 по 1 150,88, 5 из №4 по 1 090,20, цена 2 000 ₴.
  const lots = [
    lot({ kind: "OPENING", qtyIn: 5, qtyLeft: 5 }),
    lot({ kind: "BATCH", batchId: 2, qtyIn: 3, qtyLeft: 1, unitCostMinor: 115088 }),
    lot({ kind: "BATCH", batchId: 4, qtyIn: 5, qtyLeft: 5, unitCostMinor: 109020 }),
    lot({ kind: "BATCH", batchId: 4, qtyIn: 2, qtyLeft: 0, unitCostMinor: 109020 }),
  ];

  it("итог считает средние только по штукам с известной закупкой", () => {
    const s = stockSummary(lots, 200000);
    expect(s).toMatchObject({ units: 11, knownUnits: 6, unknownUnits: 5, costMinor: 660188, avgCostMinor: 110031 });
    expect(s.avgMarginMinor).toBe(89969);
    expect(s.profitMinor).toBe(200000 * 6 - 660188);
    expect(s.marginPct).toBeCloseTo(44.98, 2);
    expect(s.markupPct).toBeCloseTo(81.77, 2);
  });

  it("без известной закупки и без цены — пусто, а не ноль", () => {
    const s = stockSummary([lot({ qtyLeft: 3 })], 200000);
    expect(s).toMatchObject({ units: 3, knownUnits: 0, avgCostMinor: null, avgMarginMinor: null, profitMinor: null });
    expect(stockSummary(lots, 0).profitMinor).toBeNull();
    expect(lotMargin(100, 0)).toBeNull();
    expect(lotMargin(null, 100)).toBeNull();
    expect(lotMargin(150, 100)).toEqual({ minor: -50, pct: -50 });
  });

  it("на полосе — только партии с остатком; цвет у поставки один на все её партии, первые в продаже помечены", () => {
    const shelf = shelfLots([...lots, lot({ kind: "BATCH", batchId: 4, qtyLeft: 2, unitCostMinor: 1 })]);
    expect(shelf.map((l) => l.qtyLeft)).toEqual([5, 1, 5, 2]);
    expect(shelf[0]?.color).toBeNull();
    expect(shelf[1]?.color).not.toBe(shelf[2]?.color);
    expect(shelf[2]?.color).toBe(shelf[3]?.color);
    expect(shelf.map((l) => l.next)).toEqual([true, false, false, false]);
  });

  it("метка «продаются первыми» — у первой партии каждого варианта", () => {
    const shelf = shelfLots([lot({ variantId: "a" }), lot({ variantId: "b" }), lot({ variantId: "a" })]);
    expect(shelf.map((l) => l.next)).toEqual([true, true, false]);
  });

  it("подписи: валюта с курсом, имя партии, строка поставки", () => {
    expect(fxLine({ currency: "CNY", unitPriceFx: 17800, fxRate: 5.83 })).toBe("¥178 × 5,83");
    expect(fxLine({ currency: "USD", unitPriceFx: 1250, fxRate: null })).toBe("$12,5");
    expect(fxLine({ currency: "UAH", unitPriceFx: 100, fxRate: 1 })).toBeNull();
    expect(lotName({ kind: "BATCH", batchId: 4 })).toBe("Поставка №4");
    expect(lotName({ kind: "MANUAL", batchId: null })).toBe("Добавлены вручную");
    const b = { batchId: 4, batchTitle: "Zpmax", variantName: null, arrivedAt: null, qtyArrived: 10, onLots: 5, variantId: null } as BatchLineOption;
    expect(batchLineLabel(b)).toBe("Поставка №4 · Zpmax · приехало 10, на складе 5");
    expect(batchLinesOf([b, { ...b, variantId: "x" }], null)).toEqual([b]);
  });
});

describe("откуда +N шт", () => {
  const line = { batchItemId: 77, batchId: 4, costUnitMinor: 109020, variantId: null } as BatchLineOption;
  const old = { kind: "OLD" as const, purchaseMinor: 90000, extraMinor: 6000, note: "" };

  it("из поставки — строка поставки; старый остаток — закупка + доставка с пометкой", () => {
    expect(lotSourceRequest({ kind: "BATCH", batchItemId: 77 }, 5, null)).toEqual({ source: "BATCH", qty: 5, batchItemId: 77, variantId: undefined });
    expect(lotSourceRequest(old, 5, "v1")).toEqual({ source: "OLD", qty: 5, purchaseMinor: 90000, extraMinor: 6000, variantId: "v1" });
    expect(answerCost(old, [])).toBe(96000);
    expect(answerCost({ kind: "BATCH", batchItemId: 77 }, [line])).toBe(109020);
  });

  it("новое поступление: закупка по желанию; без неё отправлять нечего — партия и так последняя в очереди", () => {
    const fresh = { kind: "NEW" as const, purchaseMinor: null, extraMinor: null, note: "" };
    expect(lotSourceProblem(fresh)).toBeNull();
    expect(lotSourceRequest(fresh, 5, null)).toBeNull();
    expect(lotSourceRequest({ ...fresh, purchaseMinor: 80000 }, 5, null)).toMatchObject({ source: "PRICE", purchaseMinor: 80000, note: "новое поступление" });
    expect(lotSourceSummary(fresh, 5, [])).toBe("+5 шт · новое поступление · без закупки");
  });

  it("«другое» без закупки отправлять нечего — штуки останутся «без закупки»", () => {
    const other = { kind: "OTHER" as const, purchaseMinor: null, extraMinor: null, note: "пересорт" };
    expect(lotSourceRequest(other, 2, null)).toBeNull();
    expect(lotSourceSummary(other, 2, [])).toBe("+2 шт · другое: пересорт · без закупки");
    expect(lotSourceSummary({ kind: "BATCH", batchItemId: 77 }, 5, [line])).toBe("+5 шт из поставки №4");
  });

  it("без ответа, без закупки у старого и без пояснения у «другого» — нельзя", () => {
    expect(lotSourceProblem(null)).not.toBeNull();
    expect(lotSourceProblem({ ...old, purchaseMinor: null })).toBe("Впишите закупку за штуку");
    expect(lotSourceProblem({ kind: "OTHER", purchaseMinor: null, extraMinor: null, note: " " })).toBe("Напишите, откуда они");
    expect(lotSourceProblem({ ...old, extraMinor: -1 })).not.toBeNull();
    expect(lotSourceProblem(old)).toBeNull();
  });
});
