/** Схема и товары для юнит-тестов модели «Карточек» (нужны только тестам). */
import type { CardItem } from "./item";
import { normalizeSchema } from "./schema";

export const SCHEMA_RAW = {
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
      options: [{ value: "black", label_ru: "Чёрный", aliases: ["чорний"] }, { value: "white", label_ru: "Белый" }],
    },
  ],
  attributes: [
    { key: "weight_g", label_ru: "Вес", type: "number", unit: "г", category_slug: "myshki" },
    { key: "dpi", label_ru: "DPI", type: "number", range: true, category_slug: "myshki" },
    { key: "connectivity", label_ru: "Подключение", type: "multi", category_slug: "myshki-wireless", options: ["wired", "2_4ghz", { value: "bt", label_ru: "Bluetooth" }] },
    { key: "rgb", label_ru: "Подсветка", type: "bool", category_slug: "myshki-wireless" },
    { key: "sensor", label_ru: "Сенсор", type: "text", category_slug: "myshki-wireless" },
  ],
};

export const SCHEMA = normalizeSchema(SCHEMA_RAW);

export function item(over: Partial<CardItem> = {}): CardItem {
  return {
    id: "0a1b2c3d-0000-4000-8000-000000000001",
    title: "Мышь тест",
    categorySlug: "myshki-wireless",
    brand: "VGN",
    description: "Старое описание. Вес 51 г.",
    specs: {},
    ...over,
  };
}
