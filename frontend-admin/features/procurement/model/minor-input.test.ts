import { describe, expect, it } from "vitest";
import { fxToInput, inputToFx } from "./batch";
import { inputToMinor, minorToInput } from "./costing";

// Фиксация поведения ДО перехода на @shop/core/money: строки и округление остаются прежними.
describe("копейки/центы <-> поле ввода (сверка со старыми формулами)", () => {
  const minors = [0, 1, 5, 50, 99, 100, 101, 9550, 120025, 99999999, -250, -5, 1234567];
  it("minorToInput и fxToInput = (v / 100).toFixed(2)", () => {
    for (const v of minors) {
      expect(minorToInput(v)).toBe((v / 100).toFixed(2));
      expect(fxToInput(v)).toBe((v / 100).toFixed(2));
    }
  });
  it("пусто для null/undefined", () => {
    expect(minorToInput(null)).toBe("");
    expect(minorToInput(undefined)).toBe("");
    expect(fxToInput(null)).toBe("");
  });
  it("«-0» не даёт «-0.00»", () => {
    expect(minorToInput(inputToMinor("-0"))).toBe("0.00");
  });
  it("inputToMinor / inputToFx = Math.round(Number(s) * 100)", () => {
    for (const s of ["0", "0.5", "12.345", "1e-7", "95,5", " 1 200.25 ", "0.005", "1.005", "2.675", "19.99"]) {
      const n = Number(s.trim().replace(/\s/g, "").replace(",", "."));
      expect(inputToMinor(s)).toBe(Math.round(n * 100));
    }
    expect(inputToMinor("-12.345")).toBe(Math.round(-12.345 * 100));
    expect(inputToMinor("")).toBeNull();
    expect(inputToMinor("abc")).toBeNull();
    expect(inputToMinor("Infinity")).toBeNull();
    expect(inputToFx("12.345")).toBe(Math.round(12.345 * 100));
    expect(inputToFx("-1")).toBeNull();
    expect(inputToFx("0")).toBe(0);
    expect(inputToFx("")).toBeNull();
  });
});
