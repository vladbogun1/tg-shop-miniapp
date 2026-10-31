import { describe, expect, it } from "vitest";
import { languageSlices, topCustomerBars } from "./metrics";

describe("метрики пользователей", () => {
  it("языки: короткие имена, «—» и пустой язык — «не выбран»", () => {
    expect(
      languageSlices([
        { language: "uk", count: 5 },
        { language: "—", count: 2 },
        { language: "", count: 1 },
        { language: "de", count: 3 },
      ])
    ).toEqual([
      { name: "UA", value: 5 },
      { name: "не выбран", value: 2 },
      { name: "не выбран", value: 1 },
      { name: "de", value: 3 },
    ]);
    expect(languageSlices(undefined)).toEqual([]);
  });

  it("топ покупателей: первые 8, без имени — #id", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      name: i === 0 ? "" : "N" + i,
      telegramUserId: 100 + i,
      ordersCount: i,
      totalSpentMinor: i * 100,
    }));
    const bars = topCustomerBars(rows);
    expect(bars).toHaveLength(8);
    expect(bars[0]).toEqual({ name: "#100", spent: 0, orders: 0 });
    expect(bars[2]).toEqual({ name: "N2", spent: 200, orders: 2 });
    expect(topCustomerBars(undefined)).toEqual([]);
  });
});
