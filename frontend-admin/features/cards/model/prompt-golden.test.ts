/**
 * Эталон промпта для НОВОГО товара накладной: тот же файл `golden/new-product-prompt.txt` сверяет бэкенд
 * (`NewProductCardsGoldenTest`, `NewProductCards.prompt`). Поменяли промпт — обновите эталон
 * (`UPDATE_GOLDEN=1 npx vitest run features/cards/model/prompt-golden.test.ts`), прогоните бэкенд-тест и поправьте Java.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CardItem } from "./item";
import { buildCardPrompt } from "./prompt";
import { normalizeSchema } from "./schema";

const GOLDEN = path.resolve(__dirname, "golden/new-product-prompt.txt");

const SCHEMA = normalizeSchema({
  categories: [
    { id: "c1", slug: "myshki", name_ru: "Мышки", parent: null, sort: 1 },
    { id: "c2", slug: "myshki-wireless", name_ru: "Беспроводные", parentId: "c1", sort: 1 },
    { id: "c3", slug: "kovriki", name_ru: "Коврики", parent: null, sort: 2 },
  ],
  global_attributes: [
    {
      key: "color",
      label_ru: "Цвет",
      type: "enum",
      options: [{ value: "black", label_ru: "Чёрный" }, { value: "white", label_ru: "Белый" }, "red"],
    },
  ],
  attributes: [
    { key: "weight_g", label_ru: "Вес", type: "number", unit: "г", required: true, hint_ru: "без кабеля", category_slug: "myshki", sort: 1 },
    { key: "dpi", label_ru: "DPI", type: "number", range: true, category_slug: "myshki", sort: 2 },
    { key: "connectivity", label_ru: "Подключение", type: "multi", category_slug: "myshki-wireless", sort: 1, options: ["wired", "2_4ghz", { value: "bt", label_ru: "Bluetooth" }] },
    { key: "rgb", label_ru: "Подсветка", type: "bool", category_slug: "myshki-wireless", sort: 2 },
    { key: "sensor", label_ru: "Сенсор", type: "text", category_slug: "myshki-wireless", sort: 3 },
  ],
});

const base = { description: "", specs: {}, condition: "NEW" } as const;
const ITEMS: CardItem[] = [
  { ...base, id: "a", title: "Мышь VGN Dragonfly F2 Ultra+ белая", brand: "VGN", categorySlug: "myshki-wireless", variants: ["белая", "черная"], priceMinor: 249900 },
  { ...base, id: "b", title: 'Коврик "Test" XL\\1', brand: null, categorySlug: "myshki" },
  { ...base, id: "c", title: "Кабель", brand: null, categorySlug: null },
];
const IDS = new Map([["a", "p0a1b2c3d"], ["b", "p1f2e3d4c"], ["c", "pdeadbeef"]]);

describe("эталон промпта нового товара", () => {
  it("совпадает с golden/new-product-prompt.txt (его же сверяет бэкенд)", () => {
    const text = buildCardPrompt(ITEMS, SCHEMA, { part: 1, total: 1, ids: IDS });
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, text, "utf8");
    expect(text).toBe(readFileSync(GOLDEN, "utf8"));
  });
});
