import { describe, expect, it } from "vitest";
import { cat } from "./fixtures";
import { filterCounts, filterTreeByChips, moveTargets, planReparentMany, type CategoryFilter } from "./tree-filter";
import { buildTree } from "./tree";

const cats = [
  cat("mice", null, { sortOrder: 10, productCount: 5 }),
  cat("wireless", "mice", { sortOrder: 10, productCount: 3, productCountDirect: 3 }),
  cat("wired", "mice", { sortOrder: 20, showInMenu: false }),
  cat("pads", null, { sortOrder: 20, productCount: 2, productCountDirect: 2 }),
  cat("keys", null, { sortOrder: 30 }),
];
const attrs = new Map([["mice", 4]]);
const tree = buildTree(cats);

describe("чипы-фильтры", () => {
  it("считают категории", () => {
    expect(filterCounts(cats, attrs)).toEqual({ hidden: 1, nospecs: 4, noproducts: 2, seo: 0 });
  });
  it("«Скрытые» оставляет родителя как контекст", () => {
    const r = filterTreeByChips(tree, new Set<CategoryFilter>(["hidden"]), attrs);
    expect(r.map((n) => [n.cat.id, n.children.map((c) => c.id)])).toEqual([["mice", ["wired"]]]);
  });
  it("без чипов — дерево как есть", () => {
    expect(filterTreeByChips(tree, new Set(), attrs)).toBe(tree);
  });
});

describe("moveTargets", () => {
  it("корни с товарами и сама категория недоступны с причиной", () => {
    const { targets } = moveTargets(cats, [cats[1]]);
    const by = Object.fromEntries(targets.map((t) => [t.value, t.reason]));
    expect(by[""]).toBeUndefined();
    expect(by.pads).toMatch(/товары/);
    expect(by.mice).toMatch(/уже лежат/);
    expect(by.keys).toBeUndefined();
  });
  it("корень с подкатегориями нельзя переносить", () => {
    const r = moveTargets(cats, [cats[0], cats[4]]);
    expect(r.blocked.map((c) => c.id)).toEqual(["mice"]);
    expect(r.movable.map((c) => c.id)).toEqual(["keys"]);
    expect(r.targets.find((t) => t.value === "")?.reason).toMatch(/верхнем/);
  });
});

describe("planReparentMany", () => {
  it("кладёт выбранные в конец соседей по порядку", () => {
    const p = planReparentMany(cats, [cats[4]], "mice");
    expect(p.rows).toEqual([{ id: "keys", parentId: "mice", sortOrder: 30 }]);
    expect(p.optimistic.find((c) => c.id === "keys")?.parentId).toBe("mice");
  });
});
