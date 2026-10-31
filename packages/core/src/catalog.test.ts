import { describe, expect, it } from "vitest";
import {
  buildFacets,
  filterFromParams,
  filterProducts,
  filterToParams,
  formatSpec,
  priceBounds,
  type CatalogFilter,
  type CatalogSchema,
  type FilterableProduct,
} from "./catalog";

const attr = (o: Record<string, unknown>) => ({ categoryId: null, sort: 0, group: "g", filterable: true, highlight: false, ...o });

const schema = {
  categories: [
    { id: "c1", slug: "mice", parentId: null, sortOrder: 1, name: "Mice" },
    { id: "c2", slug: "wireless", parentId: "c1", sortOrder: 1, name: "Wireless" },
    { id: "c3", slug: "pads", parentId: null, sortOrder: 2, name: "Pads" },
  ],
  groups: [{ key: "g", label: "G", sort: 1 }],
  brands: [
    { slug: "lamzu", name: "Lamzu" },
    { slug: "atk", name: "ATK" },
    { slug: "zzz", name: "Zzz" },
  ],
  conditions: [
    { value: "NEW", label: "New" },
    { value: "MARKDOWN", label: "Markdown" },
    { value: "USED", label: "Used" },
  ],
  attributes: [
    attr({ key: "sensor", type: "enum", label: "Sensor", options: [{ value: "paw", label: "PAW" }, { value: "hero", label: "HERO" }] }),
    attr({ key: "feat", type: "multi", label: "Feat", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }),
    attr({ key: "rgb", type: "bool", label: "RGB" }),
    attr({ key: "weight", type: "number", label: "Weight", unit: "г" }),
    attr({
      key: "dpi",
      type: "number",
      label: "DPI",
      buckets: [{ id: "lo", label: "Low", min: null, max: 1000 }, { id: "hi", min: 1001, max: null }],
    }),
    attr({ key: "note", type: "text", label: "Note" }),
    attr({ key: "hidden", type: "enum", label: "H", filterable: false, options: [{ value: "x", label: "X" }] }),
    attr({ key: "pad", type: "enum", label: "P", categoryId: "c3", options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }] }),
  ],
} as unknown as CatalogSchema;

const p = (id: string, o: Record<string, unknown>): FilterableProduct =>
  ({ title: `Prod ${id}`, priceMinor: 10000, stock: 1, categoryId: "c2", ...o, id }) as unknown as FilterableProduct;

const products: FilterableProduct[] = [
  p("1", { brandRef: { slug: "lamzu", name: "Lamzu" }, priceMinor: 5000, specs: { sensor: "paw", feat: ["a"], rgb: true, weight: 50, dpi: 800 } }),
  p("2", { brandRef: { slug: "atk", name: "ATK" }, priceMinor: 15000, condition: "MARKDOWN", specs: { sensor: "hero", feat: ["a", "b"], weight: { min: 45, max: 60 }, dpi: 1600 } }),
  p("3", { brandRef: { slug: "atk", name: "ATK" }, priceMinor: 25000, stock: 0, variants: [{ stock: 2 }, { stock: -1 }], specs: { sensor: "paw", weight: 70, dpi: { min: 500, max: 2000 } } }),
  p("4", { title: "Ёжик pad", categoryId: "c3", priceMinor: 900, stock: 0, condition: "USED", specs: { pad: "x" } }),
  p("5", { categoryId: "c1", specs: {} }),
];

const ids = (f: CatalogFilter) => filterProducts(schema, products, f).map((x) => x.id);
const labels = { brand: "Brand", condition: "Cond" };

describe("filterProducts", () => {
  it("combines every criterion", () => {
    expect([
      ids({}),
      ids({ category: "mice" }),
      ids({ category: "wireless" }),
      ids({ category: "nope" }),
      ids({ category: "utsenka" }),
      ids({ inStock: true }),
      ids({ q: "ёжик  PAD" }),
      ids({ q: "atk prod" }),
      ids({ brands: ["atk"] }),
      ids({ conditions: ["MARKDOWN", "USED"] }),
      ids({ conditions: ["NEW"] }),
      ids({ priceMin: 100, priceMax: 200 }),
      ids({ priceMin: 120 }),
    ]).toMatchSnapshot();
  });
  it("attribute filters", () => {
    expect([
      ids({ attrs: { sensor: ["paw"] } }),
      ids({ attrs: { feat: ["b"] } }),
      ids({ attrs: { rgb: ["1"] } }),
      ids({ attrs: { weight: ["46..55"] } }),
      ids({ attrs: { weight: ["..49"] } }),
      ids({ attrs: { weight: ["65.."] } }),
      ids({ attrs: { weight: ["bad"] } }),
      ids({ attrs: { dpi: ["lo"] } }),
      ids({ attrs: { dpi: ["hi"] } }),
      ids({ attrs: { dpi: ["lo", "hi"] } }),
      ids({ attrs: { hidden: ["x"] } }),
      ids({ attrs: { note: ["x"] } }),
      ids({ attrs: { sensor: [] } }),
      ids({ category: "pads", attrs: { pad: ["x"] } }),
      ids({ attrs: { pad: ["x"] } }),
    ]).toMatchSnapshot();
  });
});

describe("buildFacets / priceBounds", () => {
  it("global", () => {
    expect(buildFacets(schema, products, {}, labels)).toMatchSnapshot();
  });
  it("with selection in category", () => {
    const f: CatalogFilter = { category: "mice", brands: ["atk"], attrs: { sensor: ["paw"], rgb: ["1"], weight: ["40..55"], dpi: ["hi"] } };
    expect(buildFacets(schema, products, f, labels)).toMatchSnapshot();
  });
  it("markdown collection / pads / selected zero", () => {
    expect(buildFacets(schema, products, { category: "utsenka" }, labels)).toMatchSnapshot();
    expect(buildFacets(schema, products, { category: "pads" }, labels)).toMatchSnapshot();
    expect(buildFacets(schema, products, { brands: ["zzz"], conditions: ["USED"], attrs: { rgb: ["1"], weight: ["1..2"] } }, labels)).toMatchSnapshot();
  });
  it("priceBounds", () => {
    expect([
      priceBounds(schema, products, {}),
      priceBounds(schema, products, { priceMin: 100, brands: ["atk"] }),
      priceBounds(schema, products, { q: "zzzz" }),
    ]).toMatchSnapshot();
  });
});

describe("url", () => {
  it("filterToParams", () => {
    const f: CatalogFilter = { q: "a b", brands: ["x", "y"], conditions: ["USED", "NEW"], priceMin: 5, priceMax: null, inStock: true, attrs: { z: ["1"], a: ["p", "q"], e: [] } };
    expect(filterToParams(f).toString()).toMatchSnapshot();
    expect(filterToParams({ priceMax: 9 }, new URLSearchParams("keep=1&f.old=1&brand=a&q=b&price=1..2&inStock=1&cond=x")).toString()).toMatchSnapshot();
    expect(filterToParams({}).toString()).toBe("");
  });
  it("filterFromParams", () => {
    const sp = new URLSearchParams("brand=a,b&cond=markdown,bad,used&price=10..&f.sensor=paw,hero&f.w=1..2&inStock=true&q=hi&f.empty=");
    expect(filterFromParams(sp)).toMatchSnapshot();
    expect(filterFromParams({ brand: ["a"], "f.x": "1,2", inStock: "1" })).toMatchSnapshot();
  });
});

describe("formatSpec", () => {
  const yn: [string, string] = ["Yes", "No"];
  const fs = (a: Record<string, unknown>, v: unknown, loc = "en") => formatSpec(attr(a) as never, v, loc, yn);
  it("per type", () => {
    expect([
      fs({ type: "number", unit: "г" }, 51),
      fs({ type: "number", unit: "г" }, { min: 1, max: 1 }),
      fs({ type: "number" }, { min: 50, max: 30000 }, "ru"),
      fs({ type: "number" }, [1]),
      fs({ type: "number" }, "x"),
      fs({ type: "enum", options: [{ value: "a", label: "A" }] }, "a"),
      fs({ type: "enum", options: [{ value: "a", label: "A" }] }, "b"),
      fs({ type: "enum" }, "b"),
      fs({ type: "multi", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }, ["a", "b", "c"]),
      fs({ type: "multi", options: [] }, ["a"]),
      fs({ type: "multi" }, []),
      fs({ type: "multi" }, "a"),
      fs({ type: "bool" }, true),
      fs({ type: "bool" }, false),
      fs({ type: "bool" }, 1),
      fs({ type: "text" }, "  hi "),
      fs({ type: "text" }, "  "),
      fs({ type: "text" }, 5),
      fs({ type: "weird" }, 5),
      fs({ type: "text" }, null),
      fs({ type: "text" }, undefined),
    ]).toMatchSnapshot();
  });
});
