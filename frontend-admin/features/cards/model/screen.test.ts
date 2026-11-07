import { describe, expect, it } from "vitest";
import { item } from "./fixtures";
import { cardsWizardHref, defaultTab, idsFromParam, listForTab, sortCards, pruneSelection, tabCounts, unfinishedOf, wizardLabel } from "./screen";

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

describe("сортировка списка", () => {
  const X = item({ id: "x", title: "Икс", cardStatus: "AI_FILLED", cardConfidence: 90 });
  const Y = item({ id: "y", title: "Игрек", cardStatus: "AI_FILLED", cardConfidence: 40, missingRequired: ["a", "b"] });
  const Z = item({ id: "z", title: "Зет", cardStatus: "AI_FILLED", cardConfidence: 70, missingRequired: ["a"] });
  it("«по вкладке» не меняет порядок", () => {
    const l = [X, Y, Z];
    expect(sortCards(l, "tab")).toBe(l);
    expect(sortCards(l, undefined)).toBe(l);
  });
  it("по уверенности, пропускам и названию", () => {
    const ids = (s: Parameters<typeof sortCards>[1]) => sortCards([X, Y, Z], s).map((i) => i.id);
    expect(ids("conf_asc")).toEqual(["y", "z", "x"]);
    expect(ids("conf_desc")).toEqual(["x", "z", "y"]);
    expect(ids("missing")).toEqual(["y", "z", "x"]);
    expect(ids("title")).toEqual(["z", "y", "x"]);
  });
  it("listForTab применяет sort", () => {
    const l = listForTab([X, Y, Z], { vitrine: "all", tab: "review", query: "", onlyIncomplete: false, sort: "conf_desc" });
    expect(l.map((i) => i.id)).toEqual(["x", "z", "y"]);
  });
});

describe("ссылка на мастер из поставки", () => {
  it("cardsWizardHref ↔ idsFromParam: только известные, без повторов", () => {
    expect(cardsWizardHref(["b", "a"])).toBe("/cards?ids=b,a");
    expect(idsFromParam("b, a,zz,b", [A, B, C])).toEqual(["b", "a"]);
    expect(idsFromParam(null, [A])).toEqual([]);
  });

  it("unfinishedOf — только «Оформить» (ИИ не заполнял)", () => {
    expect(unfinishedOf(["a", "b", "c", "b", "zz"], [A, B, C, D])).toEqual(["b"]);
  });
});
