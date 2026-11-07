import { describe, expect, it } from "vitest";
import { activeGroups, dupeGroups, dupeIds, filterBrands, mergePreview, type BrandFilter } from "./brand-dupes";
import { visibleBrands } from "./brands";
import { brand } from "./fixtures";

const list = [
  brand("a", "Attack Shark", { productCount: 2 }),
  brand("b", "AttackShark", { productCount: 5 }),
  brand("c", "Lamzu", { aliases: ["Lam-zu"] }),
  brand("d", "Razer"),
];

describe("сортировка по столбцам", () => {
  it("dir = -1 переворачивает порядок", () => {
    expect(visibleBrands(list, "", "name", -1).map((b) => b.id)).toEqual(["d", "c", "b", "a"]);
    expect(visibleBrands(list, "", "products", -1).map((b) => b.id)).toEqual(["d", "c", "a", "b"]);
  });
  it("по сайту: без сайта в конце", () => {
    const l = [brand("a", "A"), brand("b", "B", { website: "https://b.com" })];
    expect(visibleBrands(l, "", "site").map((b) => b.id)).toEqual(["b", "a"]);
  });
});

describe("возможные дубликаты", () => {
  it("находит группу по названию и сортирует по товарам", () => {
    const g = dupeGroups(list);
    expect(g).toHaveLength(1);
    expect(g[0].map((b) => b.id)).toEqual(["b", "a"]);
  });
  it("алиас, совпавший с чужим названием, тоже дубликат", () => {
    expect(dupeGroups([brand("x", "Lamzu"), brand("y", "Лам", { aliases: ["lam zu"] })])).toHaveLength(1);
  });
  it("«Не дубликаты» исключает группу", () => {
    const g = dupeGroups(list);
    expect(activeGroups(g, new Set(["a|b"]))).toHaveLength(0);
    expect([...dupeIds(activeGroups(g, new Set()))].sort()).toEqual(["a", "b"]);
  });
  it("фильтры: без товаров, без логотипа", () => {
    const f = (x: BrandFilter) => filterBrands(list, new Set([x]), new Set()).map((b) => b.id);
    expect(f("empty")).toEqual(["c", "d"]);
    expect(f("nologo")).toHaveLength(4);
  });
});

describe("mergePreview", () => {
  it("суммирует товары и собирает алиасы без повторов", () => {
    const t = brand("t", "Attack Shark", { productCount: 5, aliases: ["AS"] });
    const s = [brand("s", "AttackShark", { productCount: 2, aliases: ["as", "Атак Шарк"] })];
    expect(mergePreview(t, s)).toEqual({ products: 7, aliases: ["AS", "Атак Шарк"] });
  });
});
