import { describe, expect, it } from "vitest";
import { hasBrandNamed, rankBrands } from "./brand-search";
import { brand } from "./fixtures";

const brands = [
  brand("a", "Attack Shark", { productCount: 3, aliases: ["AttackShark"] }),
  brand("b", "Shark Pro", { productCount: 9 }),
  brand("c", "Lamzu", { productCount: 1, aliases: ["лампзу"] }),
];

describe("rankBrands", () => {
  it("пустой запрос — все, по числу товаров", () => {
    expect(rankBrands(brands, "").map((h) => h.b.id)).toEqual(["b", "a", "c"]);
  });
  it("начало имени выше части имени", () => {
    expect(rankBrands(brands, "shark").map((h) => h.b.id)).toEqual(["b", "a"]);
  });
  it("по алиасу — с подсказкой, по какому", () => {
    const hit = rankBrands(brands, "лампз")[0];
    expect(hit.b.id).toBe("c");
    expect(hit.alias).toBe("лампзу");
  });
  it("исключённые не предлагаются", () => {
    expect(rankBrands(brands, "", ["b"]).map((h) => h.b.id)).toEqual(["a", "c"]);
  });
});

describe("hasBrandNamed", () => {
  it("точное имя или алиас без учёта регистра и разделителей", () => {
    expect(hasBrandNamed(brands, "attack  shark")).toBe(true);
    expect(hasBrandNamed(brands, "attackshark")).toBe(true);
    expect(hasBrandNamed(brands, "attack")).toBe(false);
  });
});
