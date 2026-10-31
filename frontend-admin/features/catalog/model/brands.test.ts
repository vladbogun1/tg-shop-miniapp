import { describe, expect, it } from "vitest";
import { buildBrandBody, findDuplicate, hostOf, toBrandForm, visibleBrands } from "./brands";
import { brand } from "./fixtures";

const brands = [
  brand("ak", "Attack Shark", { productCount: 3, aliases: ["AttackShark"] }),
  brand("lz", "Lamzu", { productCount: 10 }),
  brand("zz", "Zzz", { productCount: 3 }),
];

describe("visibleBrands", () => {
  it("по товарам, при равенстве по имени", () => {
    expect(visibleBrands(brands, "", "products").map((b) => b.id)).toEqual(["lz", "ak", "zz"]);
  });
  it("А–Я", () => expect(visibleBrands(brands, "", "name").map((b) => b.id)).toEqual(["ak", "lz", "zz"]));
  it("поиск по алиасу и по slug", () => {
    expect(visibleBrands(brands, "attackshark", "name").map((b) => b.id)).toEqual(["ak"]);
    expect(visibleBrands(brands, "lz", "name").map((b) => b.id)).toEqual(["lz"]);
  });
});

describe("findDuplicate", () => {
  it("совпадение с названием или алиасом, себя не считает", () => {
    expect(findDuplicate(brands, undefined, "  lamzu ")?.id).toBe("lz");
    expect(findDuplicate(brands, undefined, "attackshark")?.id).toBe("ak");
    expect(findDuplicate(brands, "lz", "Lamzu")).toBeUndefined();
  });
});

describe("hostOf и форма", () => {
  it("hostOf без www и схемы", () => {
    expect(hostOf("https://www.lamzu.com/x")).toBe("lamzu.com");
    expect(hostOf("lamzu.com")).toBe("lamzu.com");
  });
  it("buildBrandBody обрезает пробелы", () => {
    const f = { ...toBrandForm(null), name: " A ", slug: " a ", website: " x.com " };
    expect(buildBrandBody(f)).toMatchObject({ name: "A", slug: "a", website: "x.com", logoUrl: "", logoMode: "MONO" });
  });
});
