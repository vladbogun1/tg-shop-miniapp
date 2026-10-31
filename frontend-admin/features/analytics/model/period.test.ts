import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValid, periodRange, todayIso } from "./period";

describe("periodRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 12:00 UTC = 15:00 в Киеве: «сегодня» в Киеве и в UTC совпадает.
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("считает календарные дни по Киеву", () => {
    expect(todayIso()).toBe("2026-10-15");
    expect(periodRange({ period: "today", channel: "all" })).toEqual({ from: "2026-10-15", to: "2026-10-15" });
    expect(periodRange({ period: "7d", channel: "all" })).toEqual({ from: "2026-10-09", to: "2026-10-15" });
    expect(periodRange({ period: "90d", channel: "all" })).toEqual({ from: "2026-07-18", to: "2026-10-15" });
    expect(periodRange({ period: "month", channel: "all" })).toEqual({ from: "2026-10-01", to: "2026-10-15" });
    expect(periodRange({ period: "year", channel: "all" })).toEqual({ from: "2026-01-01", to: "2026-10-15" });
  });

  it("прошлый месяц — с 1-го по последнее число, в том числе на границе года", () => {
    expect(periodRange({ period: "prevmonth", channel: "all" })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    vi.setSystemTime(new Date("2027-01-10T12:00:00Z"));
    expect(periodRange({ period: "prevmonth", channel: "all" })).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("свой период берёт даты как есть, без дат — сегодня", () => {
    expect(periodRange({ period: "custom", channel: "web", from: "2026-08-01", to: "2026-08-09" })).toEqual({
      from: "2026-08-01",
      to: "2026-08-09",
    });
    expect(periodRange({ period: "custom", channel: "web" })).toEqual({ from: "2026-10-15", to: "2026-10-15" });
  });

  it("после полуночи в Киеве «сегодня» уже следующий день, хотя в UTC ещё вчера", () => {
    vi.setSystemTime(new Date("2026-10-15T22:30:00Z"));
    expect(todayIso()).toBe("2026-10-16");
  });
});

describe("isValid", () => {
  it("пропускает только известные период и канал; «свой» — только с датами", () => {
    expect(isValid({ period: "month", channel: "all" })).toBe(true);
    expect(isValid({ period: "custom", channel: "web", from: "2026-08-01", to: "2026-08-09" })).toBe(true);
    expect(isValid({ period: "custom", channel: "web" })).toBe(false);
    expect(isValid({ period: "decade", channel: "all" })).toBe(false);
    expect(isValid({ period: "7d", channel: "tiktok" })).toBe(false);
    expect(isValid(null)).toBe(false);
    expect(isValid("month")).toBe(false);
  });
});
