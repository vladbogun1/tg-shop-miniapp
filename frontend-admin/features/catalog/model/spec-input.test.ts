import { describe, expect, it } from "vitest";
import { attr } from "./fixtures";
import { isNumberBad, isRangeBad, isWideField, rawFromSpecs } from "./spec-input";

const opt = (value: string) => ({ value, labelRu: value, labelUk: value, labelEn: value, aliases: [], sortOrder: 0 });
const many = (n: number) => Array.from({ length: n }, (_, i) => opt(`o${i}`));

describe("rawFromSpecs", () => {
  const attrs = [attr("w", { type: "number" }), attr("d", { type: "number", range: true }), attr("t", { type: "text" })];

  it("число раскладывается в текст одиночного поля и обе границы", () => {
    expect(rawFromSpecs(attrs, { w: 51 })).toEqual({ w: "51", "w.min": "51", "w.max": "51" });
  });

  it("диапазон: границы, одиночное поле берёт «от»; не числовые поля пропускаются", () => {
    expect(rawFromSpecs(attrs, { d: { min: 50, max: 30000 }, t: "x" })).toEqual({ "d.min": "50", "d.max": "30000", d: "50" });
  });
});

describe("проверки полей", () => {
  it("isNumberBad: только одиночное числовое поле", () => {
    expect(isNumberBad(attr("w", { type: "number" }), "12,5")).toBe(false);
    expect(isNumberBad(attr("w", { type: "number" }), "1x")).toBe(true);
    expect(isNumberBad(attr("w", { type: "number" }), "")).toBe(false);
    expect(isNumberBad(attr("w", { type: "number", range: true }), "1x")).toBe(false);
    expect(isNumberBad(attr("w", { type: "text" }), "1x")).toBe(false);
  });

  it("isRangeBad: не число или «от» больше «до»", () => {
    const r = attr("d", { type: "number", range: true });
    expect(isRangeBad(r, "1", "5")).toBe(false);
    expect(isRangeBad(r, "5", "1")).toBe(true);
    expect(isRangeBad(r, "a", "1")).toBe(true);
    expect(isRangeBad(r, "", "5")).toBe(false);
    expect(isRangeBad(attr("d", { type: "number" }), "5", "1")).toBe(false);
  });

  it("isWideField: multi и enum на 4–8 опций", () => {
    expect(isWideField(attr("m", { type: "multi", options: many(2) }))).toBe(true);
    expect(isWideField(attr("m", { type: "multi", options: [] }))).toBe(false);
    expect(isWideField(attr("e", { type: "enum", options: many(3) }))).toBe(false);
    expect(isWideField(attr("e", { type: "enum", options: many(5) }))).toBe(true);
    expect(isWideField(attr("e", { type: "enum", options: many(9) }))).toBe(false);
  });
});
