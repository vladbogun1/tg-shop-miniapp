import { describe, expect, it } from "vitest";
import { cat } from "./fixtures";
import { buildTree, categoryPathOf, childrenOf, isLeaf, pathLabel, subtreeOf } from "./tree";

const cats = [
  cat("mice", null, { sortOrder: 20, name: "Мыши" }),
  cat("pads", null, { sortOrder: 10, name: "Коврики" }),
  cat("wireless", "mice", { sortOrder: 20, name: "Беспроводные" }),
  cat("wired", "mice", { sortOrder: 10, name: "Проводные" }),
  cat("lost", "gone", { sortOrder: 30, name: "Сирота" }),
];

describe("дерево категорий", () => {
  it("корни по порядку меню, сирота считается корнем", () => {
    expect(buildTree(cats).map((n) => n.cat.id)).toEqual(["pads", "mice", "lost"]);
  });

  it("дети по порядку", () => {
    expect(childrenOf(cats, "mice").map((c) => c.id)).toEqual(["wired", "wireless"]);
    expect(buildTree(cats)[1].children.map((c) => c.id)).toEqual(["wired", "wireless"]);
  });

  it("путь и подпись пути", () => {
    expect(categoryPathOf(cats, "wired").map((c) => c.id)).toEqual(["mice", "wired"]);
    expect(pathLabel(cats, "wired")).toBe("Мыши › Проводные");
    expect(pathLabel(cats, null)).toBe("");
  });

  it("лист и поддерево", () => {
    expect(isLeaf(cats, "mice")).toBe(false);
    expect(isLeaf(cats, "wired")).toBe(true);
    expect([...subtreeOf(cats, "mice")].sort()).toEqual(["mice", "wired", "wireless"]);
  });
});
