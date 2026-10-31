import { describe, expect, it } from "vitest";
import { attributesForCategory, formatAdminSpec, groupAttributes, missingRequiredKeys, productMissingRequired } from "./attributes";
import { attr, cat, group } from "./fixtures";

const cats = [cat("mice"), cat("wired", "mice"), cat("pads")];
const attrs = [
  attr("weight", { categoryId: "mice", sortOrder: 20 }),
  attr("brand_note", { categoryId: null, sortOrder: 5 }),
  attr("cable", { categoryId: "wired", sortOrder: 1 }),
  attr("size", { categoryId: "pads", sortOrder: 1 }),
  attr("dpi", { categoryId: "mice", sortOrder: 10 }),
];

describe("attributesForCategory", () => {
  it("общие, затем корень, затем сама категория; внутри уровня по порядку", () => {
    expect(attributesForCategory(attrs, cats, "wired").map((a) => a.key)).toEqual(["brand_note", "dpi", "weight", "cable"]);
  });

  it("чужие категории не попадают; без категории — только общие", () => {
    expect(attributesForCategory(attrs, cats, "pads").map((a) => a.key)).toEqual(["brand_note", "size"]);
    expect(attributesForCategory(attrs, cats, null).map((a) => a.key)).toEqual(["brand_note"]);
  });
});

describe("groupAttributes", () => {
  const items = [attr("a", { group: "extra" }), attr("b", { group: "main" }), attr("c", { group: "zzz" })];

  it("по порядку групп, неизвестные в конце под своим ключом", () => {
    const out = groupAttributes(items, [group("main", 20, "Основное"), group("extra", 10, "Допы")]);
    expect(out.map((g) => [g.key, g.label])).toEqual([
      ["extra", "Допы"],
      ["main", "Основное"],
      ["zzz", "zzz"],
    ]);
  });

  it("пустые группы пропускаются", () => {
    expect(groupAttributes(items, [group("empty", 0)]).map((g) => g.key)).toEqual(["extra", "main", "zzz"]);
  });
});

describe("missingRequiredKeys", () => {
  const req = [attr("a", { required: true }), attr("b", { required: true }), attr("c"), attr("d", { required: true })];

  it("пустые обязательные: нет значения, пустая строка, пустой список", () => {
    expect(missingRequiredKeys(req, { a: "x", b: "  ", d: [] })).toEqual(["b", "d"]);
  });

  it("0 и false — это значения", () => {
    expect(missingRequiredKeys(req, { a: 0, b: false, d: "ok" })).toEqual([]);
  });

  it("без specs всё обязательное не заполнено", () => {
    expect(missingRequiredKeys(req, null)).toEqual(["a", "b", "d"]);
  });

  it("ответ бэкенда имеет приоритет, без категории пусто", () => {
    expect(productMissingRequired({ missingRequired: ["x"] }, req, [])).toEqual(["x"]);
    expect(productMissingRequired({ categoryId: null }, req, [])).toEqual([]);
  });
});

describe("formatAdminSpec", () => {
  const opts = [{ value: "paw", labelRu: "PAW3950", labelUk: "", labelEn: "", aliases: [], sortOrder: 0 }];

  it("число с единицей и диапазон", () => {
    expect(formatAdminSpec(attr("w", { type: "number", unitRu: "г" }), 51)).toBe("51 г");
    expect(formatAdminSpec(attr("d", { type: "number" }), { min: 5, max: 5 })).toBe("5");
    const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
    expect(formatAdminSpec(attr("d", { type: "number", unitRu: "DPI" }), { min: 50, max: 30000 })).toBe(`${nf.format(50)}–${nf.format(30000)} DPI`);
  });

  it("перечисления, да/нет, текст", () => {
    expect(formatAdminSpec(attr("s", { type: "enum", options: opts }), "paw")).toBe("PAW3950");
    expect(formatAdminSpec(attr("s", { type: "enum", options: opts }), "other")).toBe("other");
    expect(formatAdminSpec(attr("s", { type: "multi", options: opts }), ["paw", "x"])).toBe("PAW3950, x");
    expect(formatAdminSpec(attr("b", { type: "bool" }), true)).toBe("Да");
    expect(formatAdminSpec(attr("b", { type: "bool" }), false)).toBe("Нет");
    expect(formatAdminSpec(attr("t", { type: "text" }), "abc")).toBe("abc");
  });

  it("пустое значение — null", () => {
    expect(formatAdminSpec(attr("t"), undefined)).toBeNull();
    expect(formatAdminSpec(attr("t"), "  ")).toBeNull();
    expect(formatAdminSpec(attr("m", { type: "multi" }), [])).toBeNull();
  });
});
