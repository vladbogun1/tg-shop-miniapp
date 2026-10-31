import { describe, expect, it } from "vitest";
import { SCHEMA, item } from "./fixtures";
import { buildAcceptBody, buildSpecRows, changedTextCount, currentTextOf, groupSpecRows, realTextEdits } from "./review-edit";

describe("правки текстов", () => {
  const cur = (lang: string, field: string) => (lang === "ru" ? { title: "Старое", description: "Описание", conditionNote: "" }[field]! : "");
  it("realTextEdits оставляет только отличающееся от текущего", () => {
    expect(realTextEdits({ "ru/title": " Старое ", "ru/description": "Новое", "uk/title": "Нова" }, cur as never)).toEqual([
      ["ru/description", "Новое"],
      ["uk/title", "Нова"],
    ]);
  });
  it("buildAcceptBody: русский — в товар, uk/en — переводами, пустое — без ключей", () => {
    expect(buildAcceptBody(null, [])).toEqual({});
    expect(buildAcceptBody({ color: "black" }, [["ru/title", " Т "], ["ru/description", "О"], ["ru/conditionNote", "x"], ["uk/title", "Нова"], ["en/conditionNote", "opened"]])).toEqual({
      specs: { color: "black" },
      title: "Т",
      description: "О",
      translations: { uk: { title: "Нова" }, en: { conditionNote: "opened" } },
    });
  });
  it("currentTextOf и changedTextCount", () => {
    const it0 = item({ title: "Т", description: "О", conditionNote: null });
    expect(currentTextOf(it0, undefined, "ru", "title")).toBe("Т");
    expect(currentTextOf(it0, undefined, "ru", "conditionNote")).toBe("");
    expect(currentTextOf(it0, { uk: { title: { text: "Нова", origin: "AI", stale: false } }, en: {} } as never, "uk", "title")).toBe("Нова");
    expect(currentTextOf(it0, undefined, "en", "title")).toBe("");
    expect(changedTextCount({ "uk/title": {}, "uk/description": {}, "en/title": {} }, "uk")).toBe(2);
  });
});

describe("строки характеристик", () => {
  it("пустые без изменений не попадают; группы и счётчик неуверенных", () => {
    const it0 = item({ categorySlug: "myshki-wireless", specs: { color: "red", weight_g: null }, missingRequired: ["sensor"] });
    const changed = { color: { before: "blue", after: "red", c: 30 } };
    const rows = buildSpecRows(it0, SCHEMA, changed as never);
    expect(rows.map((r) => r.key).sort()).toEqual(["color", "sensor"]);
    const g = groupSpecRows(rows);
    expect(g.changed.map((r) => r.key)).toEqual(["color"]);
    expect(g.low).toBe(1);
    expect(g.empty.map((r) => r.key)).toEqual(["sensor"]);
    expect(g.same).toEqual([]);
  });
});
