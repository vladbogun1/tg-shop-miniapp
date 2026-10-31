import { describe, expect, it } from "vitest";
import { countByStatus, filterProducts, NO_BRAND, NO_CATEGORY, sortProducts, statusOptions, summarizeStock, type ListFilter } from "./list";
import { effStock, smartGroup } from "./stock";
import { product } from "./test-helpers";

const base: ListFilter = {
  search: "",
  status: "all",
  categoryScope: null,
  brandId: "",
  condition: "",
  cardFilter: "",
  archivedView: false,
  missingOf: new Map(),
  waitingOf: new Map(),
};
const ids = (l: { id: string }[]) => l.map((p) => p.id);

describe("effStock / smartGroup", () => {
  it("складывает остатки вариантов, иначе берёт собственный", () => {
    expect(effStock(product({ stock: 9, variants: [{ name: "a", stock: 2 }, { name: "b", stock: 3 }] as never }))).toBe(5);
    expect(effStock(product({ stock: 9 }))).toBe(9);
  });
  it("группы: закончился на витрине 0, в наличии 1, скрыт 2", () => {
    expect(smartGroup(product({ stock: 0 }))).toBe(0);
    expect(smartGroup(product({ stock: 1 }))).toBe(1);
    expect(smartGroup(product({ active: false }))).toBe(2);
  });
});

describe("filterProducts", () => {
  const list = [
    product({ id: "a", title: "Lamzu Atlantis", brandRef: { id: "b1", name: "Lamzu" } as never, categoryId: "c1" }),
    product({ id: "b", title: "Коврик", categoryId: "c2", stock: 0, condition: "USED" }),
    product({ id: "c", title: "Кабель", active: false, cardStatus: "READY" }),
  ];
  it("поиск по названию и бренду без учёта регистра", () => {
    expect(ids(filterProducts(list, { ...base, search: " LAMZU " }))).toEqual(["a"]);
    expect(ids(filterProducts(list, { ...base, search: "коврик" }))).toEqual(["b"]);
  });
  it("категория: none — без категории, множество — только из него", () => {
    expect(ids(filterProducts(list, { ...base, categoryScope: "none" }))).toEqual(["c"]);
    expect(ids(filterProducts(list, { ...base, categoryScope: new Set(["c2"]) }))).toEqual(["b"]);
  });
  it("бренд: NO_BRAND — без бренда, id — только он", () => {
    expect(ids(filterProducts(list, { ...base, brandId: NO_BRAND }))).toEqual(["b", "c"]);
    expect(ids(filterProducts(list, { ...base, brandId: "b1" }))).toEqual(["a"]);
    expect(NO_CATEGORY).toBe("__none");
  });
  it("состояние: пустое считается NEW", () => {
    expect(ids(filterProducts(list, { ...base, condition: "USED" }))).toEqual(["b"]);
    expect(ids(filterProducts(list, { ...base, condition: "NEW" }))).toEqual(["a", "c"]);
  });
  it("карточка: INCOMPLETE — есть незаполненные, пустой статус считается DRAFT", () => {
    expect(ids(filterProducts(list, { ...base, cardFilter: "INCOMPLETE", missingOf: new Map([["b", 2]]) }))).toEqual(["b"]);
    expect(ids(filterProducts(list, { ...base, cardFilter: "READY" }))).toEqual(["c"]);
    expect(ids(filterProducts(list, { ...base, cardFilter: "DRAFT" }))).toEqual(["a", "b"]);
  });
  it("статус: в наличии, закончились, скрытые, предзаказ; в архиве статус игнорируется", () => {
    expect(ids(filterProducts(list, { ...base, status: "instock" }))).toEqual(["a"]);
    expect(ids(filterProducts(list, { ...base, status: "out" }))).toEqual(["b"]);
    expect(ids(filterProducts(list, { ...base, status: "hidden" }))).toEqual(["c"]);
    expect(ids(filterProducts(list, { ...base, status: "preorder", waitingOf: new Map([["b", 1]]) }))).toEqual(["b"]);
    expect(ids(filterProducts(list, { ...base, status: "hidden", archivedView: true }))).toEqual(["a", "b", "c"]);
  });
});

describe("sortProducts", () => {
  const list = [
    product({ id: "x", title: "Б", priceMinor: 300, stock: 0 }),
    product({ id: "y", title: "А", priceMinor: 100, stock: 5 }),
    product({ id: "z", title: "В", priceMinor: 200, active: false, stock: 2 }),
  ];
  const w = new Map<string, number>();
  it("по названию и цене", () => {
    expect(ids(sortProducts(list, "title", w))).toEqual(["y", "x", "z"]);
    expect(ids(sortProducts(list, "price_desc", w))).toEqual(["x", "z", "y"]);
    expect(ids(sortProducts(list, "price_asc", w))).toEqual(["y", "z", "x"]);
  });
  it("по остатку", () => {
    expect(ids(sortProducts(list, "stock_asc", w))).toEqual(["x", "z", "y"]);
    expect(ids(sortProducts(list, "stock_desc", w))).toEqual(["y", "z", "x"]);
  });
  it("по спросу: больше ждущих выше", () => {
    expect(
      ids(
        sortProducts(
          list,
          "demand",
          new Map([
            ["z", 4],
            ["y", 1],
          ])
        )
      )
    ).toEqual(["z", "y", "x"]);
  });
  it("умная: закончились, в наличии, скрытые; список не мутируется", () => {
    const copy = [...list];
    expect(ids(sortProducts(list, "smart", w))).toEqual(["x", "y", "z"]);
    expect(list).toEqual(copy);
  });
});

describe("счётчики", () => {
  const list = [
    product({ id: "a", stock: 2, priceMinor: 100 }),
    product({ id: "b", stock: 0 }),
    product({ id: "c", active: false, stock: 7, unfinished: true }),
  ];
  it("countByStatus считает активные и скрытые отдельно", () => {
    expect(countByStatus(list, new Map([["a", 3]]))).toEqual({ all: 3, instock: 1, out: 1, hidden: 1, unfinished: 1, preorder: 1 });
  });
  it("statusOptions прячет пустые «Незавершённые»/«Предзаказ», пока не выбраны", () => {
    const zero = { all: 1, instock: 1, out: 0, hidden: 0, unfinished: 0, preorder: 0 };
    expect(statusOptions(zero, "all").map((o) => o.value)).toEqual(["all", "instock", "out", "hidden"]);
    expect(statusOptions(zero, "preorder").map((o) => o.value)).toContain("preorder");
  });
  it("summarizeStock — только активные", () => {
    expect(summarizeStock(list)).toEqual({ count: 2, units: 2, valueMinor: 200, out: 1 });
  });
});
