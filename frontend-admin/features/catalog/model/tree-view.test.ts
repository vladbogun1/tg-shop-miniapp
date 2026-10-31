import { describe, expect, it } from "vitest";
import { cat } from "./fixtures";
import { buildTree } from "./tree";
import { attributeCounts, filterTree, moveOptions, planReparent, planShift, treeStats } from "./tree-view";

const cats = [
  cat("mice", null, { sortOrder: 10, name: "Мыши", productCount: 5 }),
  cat("pads", null, { sortOrder: 20, name: "Коврики", productCount: 2, productCountDirect: 2, showInMenu: false }),
  cat("wired", "mice", { sortOrder: 10, name: "Проводные", slug: "wired" }),
  cat("wireless", "mice", { sortOrder: 20, name: "Беспроводные", slug: "wireless" }),
];

describe("filterTree", () => {
  const tree = buildTree(cats);
  it("пустой запрос — всё дерево", () => expect(filterTree(tree, "")).toBe(tree));
  it("совпал корень — видны все его дети", () => {
    expect(filterTree(tree, "мыши")[0].children).toHaveLength(2);
  });
  it("совпал ребёнок — корень остаётся с одним ребёнком", () => {
    const out = filterTree(tree, "беспров");
    expect(out.map((n) => n.cat.id)).toEqual(["mice"]);
    expect(out[0].children.map((c) => c.id)).toEqual(["wireless"]);
  });
  it("ничего не найдено", () => expect(filterTree(tree, "xyz")).toEqual([]));
});

describe("счётчики", () => {
  it("treeStats", () => {
    expect(treeStats(buildTree(cats), cats)).toEqual({ roots: 2, subs: 2, products: 7, hidden: 1 });
  });
  it("attributeCounts считает по категориям, общие не считает", () => {
    const m = attributeCounts([{ categoryId: "a" }, { categoryId: "a" }, { categoryId: null }, { categoryId: "b" }]);
    expect([...m]).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});

describe("перенос и сдвиг", () => {
  it("planShift меняет соседей местами и перенумеровывает по 10", () => {
    const plan = planShift(cats, cats[2], 1)!;
    expect(plan.rows).toEqual([
      { id: "wireless", parentId: "mice", sortOrder: 10 },
      { id: "wired", parentId: "mice", sortOrder: 20 },
    ]);
    expect(plan.optimistic.find((c) => c.id === "wired")!.sortOrder).toBe(20);
  });
  it("planShift за край — null", () => {
    expect(planShift(cats, cats[2], -1)).toBeNull();
    expect(planShift(cats, cats[3], 1)).toBeNull();
  });
  it("planReparent ставит в конец соседей нового родителя", () => {
    const plan = planReparent(cats, cats[1], "mice");
    expect(plan.rows).toEqual([{ id: "pads", parentId: "mice", sortOrder: 30 }]);
  });
  it("moveOptions: корни без своих товаров и верхний уровень для подкатегории", () => {
    expect(moveOptions(cats, null)).toEqual([]);
    expect(moveOptions(cats, cats[2]).map((o) => o.value)).toEqual([""]);
    expect(moveOptions(cats, cats[0])).toEqual([]);
  });
});
