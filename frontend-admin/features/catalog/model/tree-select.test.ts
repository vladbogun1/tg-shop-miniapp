import { describe, expect, it } from "vitest";
import { cat } from "./fixtures";
import { moveCursor, treeSelectRows } from "./tree-select";

const cats = [
  cat("mice", null, { name: "Мыши", sortOrder: 1, productCount: 4 }),
  cat("wired", "mice", { name: "Проводные", sortOrder: 1, productCount: 4 }),
  cat("pads", null, { name: "Коврики", sortOrder: 2, productCount: 2, showInMenu: false }),
];
const extra = [{ value: "", label: "Все категории" }];

describe("treeSelectRows", () => {
  it("leaf: корень с детьми — заголовок, лист-корень выбирается, extra сверху", () => {
    const rows = treeSelectRows(cats, "", extra, "leaf");
    expect(rows.map((r) => [r.id, r.selectable, r.depth])).toEqual([
      ["", true, 0],
      ["mice", false, 0],
      ["wired", true, 1],
      ["pads", true, 0],
    ]);
    expect(rows[1].sub).toBe("1 подкат.");
    expect(rows[3].hidden).toBe(true);
  });

  it("any: выбирается любой корень, без подписи", () => {
    const rows = treeSelectRows(cats, "", [], "any");
    expect(rows[0]).toMatchObject({ id: "mice", selectable: true, sub: undefined });
  });

  it("запрос: extra прячутся, находится ребёнок вместе с корнем", () => {
    const rows = treeSelectRows(cats, "провод", extra, "leaf");
    expect(rows.map((r) => r.id)).toEqual(["mice", "wired"]);
  });
});

describe("moveCursor", () => {
  it("стрелки в пределах списка, Home/End без гашения прокрутки", () => {
    expect(moveCursor("ArrowDown", 0, 3)).toEqual({ index: 1, prevent: true });
    expect(moveCursor("ArrowDown", 2, 3)).toEqual({ index: 2, prevent: true });
    expect(moveCursor("ArrowUp", 0, 3)).toEqual({ index: 0, prevent: true });
    expect(moveCursor("Home", 2, 3)).toEqual({ index: 0, prevent: false });
    expect(moveCursor("End", 0, 3)).toEqual({ index: 2, prevent: false });
    expect(moveCursor("a", 0, 3)).toBeNull();
  });
});
