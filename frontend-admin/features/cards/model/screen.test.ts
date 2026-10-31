import { describe, expect, it } from "vitest";
import { item } from "./fixtures";
import { defaultTab, listForTab, pruneSelection, tabCounts, wizardLabel } from "./screen";

const A = item({ id: "a", title: "Альфа", cardStatus: "AI_FILLED", active: true, cardConfidence: 50 });
const B = item({ id: "b", title: "Бета", cardStatus: "DRAFT", active: true });
const C = item({ id: "c", title: "Гамма", cardStatus: "READY", active: true, missingRequired: ["x"] });
const D = item({ id: "d", title: "Дельта", cardStatus: "READY", active: true });

describe("экран карточек", () => {
  it("tabCounts и defaultTab", () => {
    const c = tabCounts([A, B, C, D]);
    expect(c).toEqual({ draft: 1, review: 1, ready: 2 });
    expect(defaultTab(c)).toBe("review");
    expect(defaultTab({ draft: 2, review: 0, ready: 5 })).toBe("draft");
    expect(defaultTab({ draft: 0, review: 0, ready: 5 })).toBe("ready");
  });
  it("listForTab: вкладка, поиск, «только неполные» только в «Готово»", () => {
    const all = [A, B, C, D];
    expect(listForTab(all, { vitrine: "all", tab: "ready", query: "", onlyIncomplete: false }).map((i) => i.id).sort()).toEqual(["c", "d"]);
    expect(listForTab(all, { vitrine: "all", tab: "ready", query: "", onlyIncomplete: true }).map((i) => i.id)).toEqual(["c"]);
    expect(listForTab(all, { vitrine: "all", tab: "review", query: "", onlyIncomplete: true }).map((i) => i.id)).toEqual(["a"]);
    expect(listForTab(all, { vitrine: "all", tab: "review", query: "бета", onlyIncomplete: false })).toEqual([]);
    expect(listForTab(all, { vitrine: "hidden", tab: "review", query: "", onlyIncomplete: false })).toEqual([]);
  });
  it("pruneSelection возвращает тот же Set, если ничего не ушло", () => {
    const s = new Set(["a", "b"]);
    expect(pruneSelection(s, [A, B])).toBe(s);
    expect([...pruneSelection(s, [A])]).toEqual(["a"]);
    const e = new Set<string>();
    expect(pruneSelection(e, [])).toBe(e);
  });
  it("wizardLabel", () => {
    expect(wizardLabel(2, 2, "draft")).toBe("отмеченные: 2");
    expect(wizardLabel(0, 5, "review")).toBe("вкладка «Проверить»: 5");
  });
});
