import { describe, expect, it } from "vitest";
import { SCHEMA, SCHEMA_RAW, item } from "./fixtures";
import { assignCardIds, priceUah, splitIntoBatches, variantNames } from "./item";
import { buildCardPrompt, productInput, schemaSection } from "./prompt";
import { attributesForCategory, categoryPathName, isLeafCategory, leafCategories, leavesUnder, normalizeSchema } from "./schema";

describe("схема", () => {
  it("normalizeSchema: категории, родители по id, глобальные и плоские атрибуты", () => {
    expect(SCHEMA.categories.map((c) => [c.slug, c.parentSlug])).toEqual([
      ["myshki", null],
      ["myshki-wireless", "myshki"],
      ["kovriki", null],
    ]);
    expect(SCHEMA.attributes.map((a) => [a.key, a.categorySlug, a.type])).toEqual([
      ["color", null, "enum"],
      ["weight_g", "myshki", "number"],
      ["dpi", "myshki", "number"],
      ["connectivity", "myshki-wireless", "multi"],
      ["rgb", "myshki-wireless", "bool"],
      ["sensor", "myshki-wireless", "text"],
    ]);
    expect(SCHEMA.attributes.find((a) => a.key === "dpi")?.range).toBe(true);
    expect(SCHEMA.attributes.find((a) => a.key === "weight_g")?.unit).toBe("г");
  });
  it("normalizeSchema: мусор → пустая схема", () => {
    expect(normalizeSchema(null)).toEqual({ categories: [], attributes: [] });
    expect(normalizeSchema({ categories: [1, { slug: "" }] })).toEqual({ categories: [], attributes: [] });
  });
  it("normalizeSchema: формат файла (вложенные атрибуты категорий, parent = slug)", () => {
    const s = normalizeSchema({
      categories: [
        { slug: "a", name_ru: "А", attributes: [{ key: "k", label_ru: "К", type: "NUMBER", unit: { ru: "мм" } }] },
        { slug: "b", parent: "a" },
      ],
    });
    expect(s.categories[1]).toMatchObject({ slug: "b", parentSlug: "a", nameRu: "b" });
    expect(s.attributes[0]).toMatchObject({ key: "k", categorySlug: "a", type: "number", unit: "мм" });
  });
  it("дерево: путь, лист, листья, листья под родителем", () => {
    expect(categoryPathName(SCHEMA, "myshki-wireless")).toBe("Мышки › Беспроводные");
    expect(isLeafCategory(SCHEMA, "myshki")).toBe(false);
    expect(isLeafCategory(SCHEMA, "kovriki")).toBe(true);
    expect(isLeafCategory(SCHEMA, "zzz")).toBe(false);
    expect(leafCategories(SCHEMA).map((c) => c.slug)).toEqual(["myshki-wireless", "kovriki"]);
    expect(leavesUnder(SCHEMA, "myshki").map((c) => c.slug)).toEqual(["myshki-wireless"]);
  });
  it("attributesForCategory: общие → корень → категория; глубже перекрывает", () => {
    expect(attributesForCategory(SCHEMA, "myshki-wireless").map((a) => a.key)).toEqual(["color", "weight_g", "dpi", "connectivity", "rgb", "sensor"]);
    expect(attributesForCategory(SCHEMA, "myshki-wireless", false).map((a) => a.key)).toEqual(["weight_g", "dpi", "connectivity", "rgb", "sensor"]);
    expect(attributesForCategory(SCHEMA, null).map((a) => a.key)).toEqual(["color"]);
    const over = normalizeSchema({
      ...SCHEMA_RAW,
      attributes: [...SCHEMA_RAW.attributes, { key: "weight_g", label_ru: "Вес (беспров.)", type: "number", category_slug: "myshki-wireless" }],
    });
    const w = attributesForCategory(over, "myshki-wireless").filter((a) => a.key === "weight_g");
    expect(w.map((a) => a.labelRu)).toEqual(["Вес (беспров.)"]);
  });
});

describe("товары", () => {
  it("assignCardIds: p + 8 символов, длиннее при общем префиксе", () => {
    const ids = assignCardIds(["0a1b2c3d-0000-4000-8000-000000000001", "9f000000-0000-4000-8000-000000000002"]);
    expect([...ids.values()]).toEqual(["p0a1b2c3d", "p9f000000"]);
    const same = assignCardIds(["0a1b2c3d-1111-4000-8000-000000000001", "0a1b2c3d-2222-4000-8000-000000000002"]);
    expect([...same.values()]).toEqual(["p0a1b2c3d1", "p0a1b2c3d2"]);
  });
  it("variantNames, priceUah, splitIntoBatches", () => {
    expect(variantNames(item({ variants: ["Чёрный", { name: " Белый " }, { name: null }, " "] }))).toEqual(["Чёрный", "Белый"]);
    expect(priceUah(item({ priceMinor: 12345 }))).toBe(123.45);
    expect(priceUah(item({ price: 500 }))).toBe(5);
    expect(priceUah(item())).toBeNull();
    expect(splitIntoBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(splitIntoBatches([1, 2], 0)).toEqual([[1], [2]]);
  });
});

describe("запрос к ИИ", () => {
  it("productInput: минимум и полный набор", () => {
    expect(productInput(item({ categorySlug: null, brand: null, description: null }), SCHEMA)).toEqual({
      title: "Мышь тест",
      brand: null,
      category: null,
      description: "",
      specs: {},
    });
    expect(
      productInput(
        item({
          categorySlug: "myshki",
          condition: "used",
          conditionNote: "царапины",
          variants: ["Чёрный"],
          priceMinor: 100000,
          specs: { weight_g: 50 },
          missingRequired: ["dpi"],
        }),
        SCHEMA
      )
    ).toEqual({
      title: "Мышь тест",
      brand: "VGN",
      category: "myshki",
      categoryPath: "Мышки",
      categoryNote: "это не лист — выбери подкатегорию",
      condition: "Б/у",
      conditionNote: "царапины",
      variants: ["Чёрный"],
      priceUah: 1000,
      description: "Старое описание. Вес 51 г.",
      specs: { weight_g: 50 },
      missingRequired: ["dpi"],
    });
  });
  it("schemaSection: листья, общие, разделы нужных категорий", () => {
    const s = schemaSection([item(), item({ categorySlug: null })], SCHEMA);
    expect(s).toContain("- myshki-wireless — Мышки › Беспроводные");
    expect(s).toContain("### Общие для всех категорий\n- color — Цвет — enum");
    expect(s).toContain("### myshki — Мышки (для всех подкатегорий)");
    expect(s).toContain("### myshki-wireless — Мышки › Беспроводные\n");
    expect(s).toContain("- connectivity — Подключение — multi (массив)");
    expect(s).toContain("опции: wired; 2_4ghz; bt (Bluetooth)");
    expect(s).toContain("У части товаров нет категории");
    expect(s).not.toContain("### kovriki");
  });
  it("schemaSection: родитель тянет все листья, пустая категория без своих характеристик", () => {
    const s = schemaSection([item({ categorySlug: "myshki" })], SCHEMA);
    expect(s).toContain("### myshki-wireless");
    const k = schemaSection([item({ categorySlug: "kovriki" })], SCHEMA);
    expect(k).toContain("- (своих характеристик нет)");
    expect(k).not.toContain("У части товаров");
    expect(schemaSection([], { categories: [], attributes: [] })).toContain("- (нет)");
  });
  it("buildCardPrompt: заголовок пакета, схема и JSON товаров", () => {
    const a = item();
    const text = buildCardPrompt([a], SCHEMA, { part: 2, total: 3 });
    expect(text).toContain("Это пакет 2 из 3 (1 товаров).");
    expect(text).toContain('"p0a1b2c3d": {');
    expect(buildCardPrompt([a], SCHEMA, { part: 1, total: 1 })).toContain("Всего товаров: 1.");
    expect(buildCardPrompt([a], SCHEMA, { part: 1, total: 1, ids: new Map([[a.id, "pzzz"]]) })).toContain('"pzzz": {');
  });
});
