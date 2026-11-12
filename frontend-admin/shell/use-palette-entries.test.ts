import { describe, expect, it } from "vitest";
import type { SettingItem } from "@/features/settings";
import { searchEntries, settingEntries } from "./use-palette-entries";

describe("searchEntries", () => {
  it("превращает группы поиска в строки палитры с пометкой «найдено» и подписью", () => {
    const rows = searchEntries([
      { title: "Заказы", rows: [{ key: "o:1", title: "#1 · Анна", hint: "+380", href: "/orders/1" }] },
      { title: "Товары", rows: [{ key: "p:1", title: "Мышь", hint: "LZ-1", href: "/products?edit=1" }] },
    ]);
    expect(rows.map((r) => [r.key, r.group, r.found, r.hint, r.href])).toEqual([
      ["o:1", "Заказы", true, "+380", "/orders/1"],
      ["p:1", "Товары", true, "LZ-1", "/products?edit=1"],
    ]);
  });
});

describe("settingEntries", () => {
  const items = [
    { key: "novaposhta.tracking", group: "novaposhta", subgroup: "tracking", label: "Отслеживать посылки", description: "статусы" },
    { key: "catalog.lowStockQty", group: "stock", subgroup: null, label: "Порог «мало на складе»", description: "посылки нет" },
  ] as unknown as SettingItem[];

  it("находит поле по подписи и ведёт на его раздел, вкладку и якорь", () => {
    expect(settingEntries(items, "посылк").map((r) => [r.key, r.group, r.found, r.hint, r.href])).toEqual([
      ["setting:novaposhta.tracking", "Настройки", true, "Доставка", "/settings/delivery?tab=tracking#setting-novaposhta.tracking"],
    ]);
  });

  it("короткий запрос или настройки ещё не загружены — ничего", () => {
    expect(settingEntries(items, "п")).toEqual([]);
    expect(settingEntries(undefined, "посылк")).toEqual([]);
  });
});
