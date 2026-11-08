import { describe, expect, it } from "vitest";
import type { CatalogItem, ReviewRow, SourceLine } from "../ai/types";
import { draftProblems, draftProducts, parseAmount, productKey, proposePrices, specRows, stepStates } from "./draft";

const line = (id: string, unitPrice: number | null = 10): SourceLine => ({
  id, text: `${id} text`, variant: null, en: null, brand: null, model: null, color: null, qty: 1, unitPrice, lineTotal: null, notes: null,
});
const fresh = (id: string, title: string, variant: string | null = null, categoryId: string | null = "c1"): ReviewRow => ({
  line: line(id), decision: { kind: "new", draft: { title, brand: null, categoryId, variant, source: null } }, candidates: [],
});
const matched = (id: string, productId: string, variantId: string | null = null): ReviewRow => ({
  line: line(id), decision: { kind: "match", productId, variantId, by: "ai" }, candidates: [],
});
const item = (id: string, title: string, variants: string[] = []): CatalogItem => ({
  id, title, brand: null, categoryId: "c1", variants: variants.map((v) => ({ id: v, name: v })), imageUrl: null,
});

describe("productKey", () => {
  it("prefers the line that already has a card or a card task, else the first line", () => {
    expect(productKey(["L2", "L3"], {}, [])).toBe("L2");
    expect(productKey(["L2", "L3"], { L3: {} }, [])).toBe("L3");
    expect(productKey(["L2", "L3"], {}, [{ kind: "CARD", key: "L3" }, { kind: "READ", key: null }])).toBe("L3");
  });
});

describe("parseAmount", () => {
  it("reads spaces and a comma, refuses junk and empty", () => {
    expect(parseAmount("1 250,5")).toBe(1250.5);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("draftProducts", () => {
  it("groups lines of one title into a product with variants, its price under the server key", () => {
    const rows = [fresh("L1", "Mouse X", "Black"), fresh("L2", "mouse x", "White"), matched("L3", "p1")];
    const [p] = draftProducts(rows, { L2: {} }, [], { L2: "1490" });
    expect(p.id).toBe("L2");
    expect(p.variants).toEqual(["Black", "White"]);
    expect(p.priceUah).toBe(1490);
  });
});

describe("draftProblems", () => {
  const base = { catalog: [item("p1", "Pad", ["Red"])], leafIds: new Set(["c1"]), currency: "CNY", fxRate: 6 };

  it("names a missing variant, price, currency and rate", () => {
    const rows = [matched("L1", "p1"), fresh("L2", "Mouse X")];
    const products = draftProducts(rows, {}, [], {});
    const out = draftProblems({ ...base, rows, products, currency: null, fxRate: null });
    expect(out).toEqual(expect.arrayContaining([
      "L1: выберите вариант товара",
      "«Mouse X»: черновая цена продажи",
      "Выберите валюту накладной",
      "Введите курс",
    ]));
  });

  it("a title already in the catalog and a non-leaf category stop it too", () => {
    const rows = [matched("L1", "p1", "Red"), fresh("L2", "pad", null, "root")];
    const products = draftProducts(rows, {}, [], { L2: "100" });
    expect(draftProblems({ ...base, rows, products })).toEqual([
      "«pad» уже есть в каталоге — выберите его или переименуйте новый",
      "«pad»: выберите конечную категорию",
    ]);
  });

  it("is empty when everything is decided", () => {
    const rows = [matched("L1", "p1", "Red"), fresh("L2", "Mouse X")];
    expect(draftProblems({ ...base, rows, products: draftProducts(rows, {}, [], { L2: "100" }) })).toEqual([]);
  });
});

describe("stepStates", () => {
  it("marks the steps around the current one", () => {
    expect(stepStates("MATCH", "RUNNING")).toEqual(["done", "active", "waiting", "waiting"]);
    expect(stepStates("READ", "FAILED")).toEqual(["failed", "waiting", "waiting", "waiting"]);
    expect(stepStates("DONE", "READY")).toEqual(["done", "done", "done", "done"]);
  });
});

describe("specRows", () => {
  it("names the specs and their options in Russian, with the unit", () => {
    const attrs = new Map([
      ["weight", { labelRu: "Вес", unit: "г", options: [] }],
      ["sensor", { labelRu: "Сенсор", unit: null, options: [{ value: "paw3950", labelRu: "PAW3950" }] }],
      ["wireless", { labelRu: "Беспроводная", unit: null, options: [] }],
    ]);
    expect(specRows({ weight: { min: 48, max: 52 }, sensor: ["paw3950"], wireless: true, empty: "", other: 3 }, attrs)).toEqual([
      { key: "weight", label: "Вес", value: "48–52 г" },
      { key: "sensor", label: "Сенсор", value: "PAW3950" },
      { key: "wireless", label: "Беспроводная", value: "да" },
      { key: "other", label: "other", value: "3" },
    ]);
  });
});

describe("proposePrices", () => {
  it("fills only empty prices: average purchase × rate × 2, rounded to tens", () => {
    const rows = [fresh("L1", "Mouse X", "Black"), fresh("L2", "Mouse X", "White"), fresh("L3", "Pad")];
    rows[1].line.unitPrice = 20;
    const products = draftProducts(rows, {}, [], {});
    expect(proposePrices(products, rows, 6, { L3: "999" })).toEqual({ L1: "180", L3: "999" });
    expect(proposePrices(products, rows, null, {})).toEqual({});
  });
});
