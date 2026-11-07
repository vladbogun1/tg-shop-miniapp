import { describe, expect, it } from "vitest";
import { searchEntries } from "./use-palette-entries";

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
