import { describe, expect, it } from "vitest";
import { SCHEMA, item } from "./fixtures";
import { reviewProduct } from "./review";
import { autoReady, buildImportItem, defaultSel, mergeSel, renameByDefault, ruAccepted, translationSendable } from "./selection";
import type { ProductReview } from "./types";

const FULL = {
  category: "myshki-wireless",
  brand: "Новый",
  specs: { weight_g: 5, color: "black", sensor: "x" },
  confidence: { color: 90, weight_g: 20 },
  title: { ru: "Новое название", uk: "Нова назва", en: "New title" },
  description: { ru: "Новое описание", uk: "Новий опис", en: "New description" },
  sources: ["https://a.com"],
  notes: "n",
  field_sources: { color: "https://c.com" },
  overall: 90,
};

const review = (raw: unknown, over = {}): ProductReview => {
  const r = reviewProduct("p0a1b2c3d", item({ categorySlug: "kovriki", ...over }), raw, SCHEMA);
  if ("problems" in r) throw new Error("bad");
  return r;
};

describe("выбор полей", () => {
  it("defaultSel: что включено по умолчанию", () => {
    const r = review(FULL);
    const s = defaultSel(r);
    expect(s).toMatchObject({ on: true, title: false, description: true, category: true, brand: true, translations: true });
    expect([...s.fields]).toEqual(["color", "sensor"]);
    expect(defaultSel(r, { created: true }).title).toBe(true);
  });
  it("renameByDefault: только для скрытых черновиков или нового товара", () => {
    expect(renameByDefault(review(FULL, { active: false }))).toBe(true);
    expect(renameByDefault(review(FULL, { active: true }))).toBe(false);
    expect(renameByDefault(review(FULL, { active: false, cardStatus: "READY" }))).toBe(false);
    expect(renameByDefault(review(FULL), true)).toBe(true);
  });
  it("mergeSel: сохраняет выбор, пропускает невалидные, добавляет новые", () => {
    const r = review({ category: "myshki-wireless", specs: { color: "black", sensor: "PAW" }, confidence: { color: 90, sensor: 90 }, overall: 90 });
    const old = { ...defaultSel(r), fields: new Set(["gone", "color"]), brand: true };
    const m = mergeSel(old, r);
    expect([...m.fields].sort()).toEqual(["color", "sensor"]);
    expect(m.brand).toBe(true);
    expect(mergeSel(undefined, r).fields.size).toBe(2);
  });
  it("autoReady: нужна уверенность ≥ 80 и нет догадок среди выбранных полей", () => {
    const r = review(FULL);
    const s = { ...defaultSel(r), fields: new Set(["color", "weight_g"]) };
    expect(autoReady(r, s)).toBe(false); // weight_g: 20 %
    expect(autoReady(r, { ...s, fields: new Set(["color"]) })).toBe(true);
    expect(autoReady(r, undefined)).toBe(false);
    expect(autoReady({ ...r, overall: 79 }, { ...s, fields: new Set(["color"]) })).toBe(false);
  });
  it("ruAccepted и translationSendable", () => {
    const r = review(FULL);
    const t = r.texts.title!;
    const s = defaultSel(r);
    expect(ruAccepted(t, s)).toBe(false);
    expect(translationSendable(t, "uk", s)).toBe(false);
    expect(translationSendable(t, "uk", { ...s, title: true })).toBe(true);
    expect(translationSendable(t, "uk", { ...s, title: true, translations: false })).toBe(false);
  });
});

describe("buildImportItem", () => {
  it("полный набор: поля, категория, бренд, тексты, переводы, источники", () => {
    const r = review(FULL);
    const s = { ...defaultSel(r), title: true, fields: new Set(["color", "weight_g"]) };
    const out = buildImportItem(r, s, { markReady: true, model: " gpt ", publish: true });
    expect(out).toMatchObject({
      productId: r.item.id,
      confidence: { color: 90, weight_g: 20 },
      markReady: true,
      publish: true,
      overall: 90,
      categorySlug: "myshki-wireless",
      brand: "Новый",
      title: "Новое название",
      description: "Новое описание",
      translations: {
        uk: { title: "Нова назва", description: "Новий опис" },
        en: { title: "New title", description: "New description" },
      },
      sources: ["https://a.com"],
      notes: "n",
      model: "gpt",
    });
    expect(Object.keys((out as { specs: object }).specs)).toEqual(["color", "weight_g"]);
  });
  it("источники полей попадают только для выбранных", () => {
    const r = review({ category: "myshki-wireless", specs: { color: "black", sensor: "x" }, field_sources: { color: "https://c.com" }, overall: 90 });
    const out = buildImportItem(r, { ...defaultSel(r), fields: new Set(["color"]) }, { markReady: false });
    expect(out?.fieldSources).toEqual({ color: "https://c.com" });
  });
  it("null: выключено, ошибка или нечего отправлять", () => {
    const r = review(FULL);
    expect(buildImportItem(r, undefined, { markReady: false })).toBeNull();
    expect(buildImportItem(r, { ...defaultSel(r), on: false }, { markReady: false })).toBeNull();
    const none = review({ specs: { weight_g: 1 }, overall: 90 }, { categorySlug: "myshki" });
    const s = { ...defaultSel(none), fields: new Set<string>() };
    expect(buildImportItem(none, s, { markReady: false })).toBeNull();
    expect(buildImportItem(none, s, { markReady: true })).toMatchObject({ markReady: true, specs: {} });
  });
  it("модель берётся из ответа раньше, чем из настроек; перевод причины уценки без смены русского", () => {
    const r = review({ model: "claude", conditionNote: { ru: "x", uk: "відкрита", en: "opened" }, specs: { weight_g: 1 }, overall: 90 }, { conditionNote: "вскрыта", categorySlug: "myshki" });
    const out = buildImportItem(r, { ...defaultSel(r), fields: new Set(["weight_g"]) }, { markReady: false, model: "gpt" });
    expect(out?.model).toBe("claude");
    expect(out?.translations).toEqual({ uk: { conditionNote: "відкрита" }, en: { conditionNote: "opened" } });
  });
});
