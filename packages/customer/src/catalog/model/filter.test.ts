import { describe, expect, it } from "vitest";
import { activeFilterCount, filterFromParams, filterProducts, filterToParams, type FilterableProduct } from "@shop/core/catalog";
import { EMPTY_FILTER, EMPTY_SCHEMA } from "./filter";
import { specsOf } from "./product";

const item = (over: Partial<FilterableProduct> & { id: string }): FilterableProduct => ({ title: over.id, priceMinor: 100, stock: 1, ...over });

describe("catalog filter over the wire shape of the product", () => {
  const items = [
    item({ id: "a", priceMinor: 10000, stock: 3, condition: "NEW" }),
    item({ id: "b", priceMinor: 50000, stock: 0, condition: null }), // null = NEW
    item({ id: "c", priceMinor: 90000, stock: 2, condition: "USED", variants: null }),
    item({ id: "d", priceMinor: 30000, stock: 0, variants: [{ stock: 2 }, { stock: 0 }] }), // stock of the variants
  ];
  const ids = (f: Parameters<typeof filterProducts>[2]) => filterProducts(EMPTY_SCHEMA, items, f).map((p) => p.id);

  it("empty filter keeps everything", () => {
    expect(ids(EMPTY_FILTER)).toEqual(["a", "b", "c", "d"]);
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
  });

  it("inStock counts variants, a null condition is NEW", () => {
    expect(ids({ ...EMPTY_FILTER, inStock: true })).toEqual(["a", "c", "d"]);
    expect(ids({ ...EMPTY_FILTER, conditions: ["NEW"] })).toEqual(["a", "b", "d"]);
    expect(ids({ ...EMPTY_FILTER, conditions: ["USED"] })).toEqual(["c"]);
  });

  it("price range is in whole UAH and inclusive", () => {
    expect(ids({ ...EMPTY_FILTER, priceMin: 300, priceMax: 500 })).toEqual(["b", "d"]);
  });

  it("q matches the title", () => {
    expect(ids({ ...EMPTY_FILTER, q: "c" })).toEqual(["c"]);
  });

  it("url params round trip", () => {
    const f = { ...EMPTY_FILTER, conditions: ["USED" as const], priceMin: 100, priceMax: 900, inStock: true };
    const back = filterFromParams(filterToParams(f));
    expect(back).toMatchObject({ conditions: ["USED"], priceMin: 100, priceMax: 900, inStock: true });
  });

  it("specsOf gives an empty object for a missing JSON column", () => {
    expect(specsOf({ specs: null })).toEqual({});
    expect(specsOf({ specs: { dpi: 800 } })).toEqual({ dpi: 800 });
  });
});
