import { describe, expect, it } from "vitest";
import { sortBySize } from "./batch";

const n = (...names: string[]) => names.map((name) => ({ name }));

describe("варианты по размеру", () => {
  it("L, XL, S, 2XL → S, L, XL, 2XL", () => {
    expect(sortBySize(n("L", "XL", "S", "2XL")).map((v) => v.name)).toEqual(["S", "L", "XL", "2XL"]);
  });
  it("не размеры — порядок как был", () => {
    expect(sortBySize(n("Белый", "S", "Чёрный")).map((v) => v.name)).toEqual(["Белый", "S", "Чёрный"]);
  });
});
