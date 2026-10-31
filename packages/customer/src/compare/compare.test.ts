import { COMPARE_MAX_PER_GROUP } from "@shop/core/compare";
import { describe, expect, it, vi } from "vitest";
import { createCompareStore } from "./store";
import { toggleCompareIn, type CompareToggleUi } from "./toggle";

function ui(): CompareToggleUi {
  return { removed: vi.fn(), added: vi.fn(), groupFull: vi.fn(), totalFull: vi.fn(), track: vi.fn() };
}

describe("переключатель сравнения", () => {
  it("добавляет, сообщает число в группе и шлёт аналитику только при успехе", () => {
    const store = createCompareStore();
    const u = ui();
    expect(toggleCompareIn(store, u, "a", "mice")).toBe(true);
    expect(u.track).toHaveBeenCalledWith("a");
    expect(u.added).toHaveBeenCalledWith(1, "mice");
    expect(store.getState().entries.map((e) => e.id)).toEqual(["a"]);
  });

  it("повторное нажатие убирает товар", () => {
    const store = createCompareStore();
    const u = ui();
    toggleCompareIn(store, u, "a", "mice");
    expect(toggleCompareIn(store, u, "a", "mice")).toBe(false);
    expect(u.removed).toHaveBeenCalledTimes(1);
    expect(store.getState().entries).toEqual([]);
  });

  it("переполненная группа: сообщение об отказе без аналитики", () => {
    const store = createCompareStore();
    const u = ui();
    for (let i = 0; i < COMPARE_MAX_PER_GROUP; i++) toggleCompareIn(store, ui(), `p${i}`, "mice");
    expect(toggleCompareIn(store, u, "extra", "mice")).toBe(false);
    expect(u.groupFull).toHaveBeenCalledWith(COMPARE_MAX_PER_GROUP);
    expect(u.track).not.toHaveBeenCalled();
  });
});

describe("стор сравнения", () => {
  it("openScreen зовёт политику onOpen до открытия; prune выбрасывает пропавшие", () => {
    const onOpen = vi.fn();
    const store = createCompareStore({ onOpen });
    store.getState().add("a", "g");
    store.getState().add("b", "g");
    store.getState().openScreen("g");
    expect(onOpen).toHaveBeenCalledWith(2);
    expect(store.getState()).toMatchObject({ open: true, focusGroup: "g" });
    store.getState().prune(new Set(["a"]));
    expect(store.getState().entries.map((e) => e.id)).toEqual(["a"]);
    store.getState().closeScreen();
    expect(store.getState().open).toBe(false);
  });
});
