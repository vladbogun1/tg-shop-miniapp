import { describe, expect, it } from "vitest";
import { filterRows, groupByPerson, limitFill, totalOf } from "./registry-view";
import type { GiftRegistryRow } from "./types";

const row = (o: Partial<GiftRegistryRow>): GiftRegistryRow =>
  ({ orderId: "o", customerName: "А", phone: "1", month: "2026-11", valueMinor: 100, monthTotalMinor: 100, overLimit: false, source: "CASE", ...o }) as GiftRegistryRow;

describe("реестр на экране", () => {
  const rows = [row({ source: "CASE" }), row({ source: "ADMIN", overLimit: true, valueMinor: 50 }), row({ customerName: "Б", phone: "2", monthTotalMinor: 900, source: "THRESHOLD" })];
  it("фильтры", () => {
    expect(filterRows(rows, "all")).toHaveLength(3);
    expect(filterRows(rows, "over")).toHaveLength(1);
    expect(filterRows(rows, "THRESHOLD")).toHaveLength(1);
  });
  it("итог", () => {
    expect(totalOf(rows)).toEqual({ count: 3, valueMinor: 250 });
  });
  it("группы по человеку и месяцу: сначала сверх лимита", () => {
    const g = groupByPerson(rows);
    expect(g).toHaveLength(2);
    expect(g[0].name).toBe("А");
    expect(g[0].rows).toHaveLength(2);
    expect(g[0].overLimit).toBe(true);
  });
  it("полоса лимита", () => {
    expect(limitFill(50, 100)).toBe(50);
    expect(limitFill(500, 100)).toBe(100);
    expect(limitFill(5, 0)).toBe(0);
  });
});
