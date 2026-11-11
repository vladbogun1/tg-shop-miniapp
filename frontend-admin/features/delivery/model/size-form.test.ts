import { describe, expect, it } from "vitest";
import { EMPTY_SIZE, categoryDepth, productForms, productSizeBody, productSizeDirty, sameSize, sizeFromForm, sizeToForm } from "./size-form";

describe("размеры посылки в форме", () => {
  it("мм ↔ см, граммы, пусто = наследовать", () => {
    expect(sizeToForm({ weightG: 350, lengthMm: 205, widthMm: 100, heightMm: null })).toEqual({ weight: "350", l: "20.5", w: "10", h: "" });
    expect(sizeFromForm({ weight: "", l: "20,5", w: "10", h: "0" })).toEqual({ weightG: null, lengthMm: 205, widthMm: 100, heightMm: null });
    expect(sizeToForm(null)).toEqual(EMPTY_SIZE);
  });
  it("10 и 10,0 — одно и то же", () => {
    expect(sameSize({ ...EMPTY_SIZE, l: "10" }, { ...EMPTY_SIZE, l: "10,0" })).toBe(true);
    expect(sameSize({ ...EMPTY_SIZE, l: "10" }, { ...EMPTY_SIZE, l: "11" })).toBe(false);
  });
  it("товар и варианты: изменение и тело PUT", () => {
    const data = {
      id: "p",
      size: { weightG: 300, lengthMm: null, widthMm: null, heightMm: null },
      variants: [{ id: "v1", name: "Белый", size: { weightG: null, lengthMm: null, widthMm: null, heightMm: null } }],
    };
    const f = productForms(data);
    expect(productSizeDirty(data, f)).toBe(false);
    const edited = { ...f, variants: { v1: { ...EMPTY_SIZE, weight: "320" } } };
    expect(productSizeDirty(data, edited)).toBe(true);
    expect(productSizeBody(data, edited).variants[0].size.weightG).toBe(320);
  });
  it("глубина категории", () => {
    const byId = new Map([
      ["a", { parentId: null }],
      ["b", { parentId: "a" }],
    ]);
    expect(categoryDepth({ parentId: "b" }, byId)).toBe(2);
    expect(categoryDepth({ parentId: null }, byId)).toBe(0);
  });
});
