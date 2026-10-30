import { afterEach, describe, expect, it } from "vitest";
import { dayInZone, dayKey, dayLabel, formatDate, formatDateTime, formatMoment, formatTime, now, nowMs, setClock, timeAgo } from "./time";

const LABELS = { today: "T", yesterday: "Y", justNow: "now", minutes: "{n}m", hours: "{n}h" };

afterEach(() => setClock(null));

describe("clock", () => {
  it("now()/nowMs() follow the injected clock and reset to the real one", () => {
    setClock(() => 1_000);
    expect(nowMs()).toBe(1_000);
    expect(now().getTime()).toBe(1_000);
    setClock(null);
    expect(Math.abs(nowMs() - Date.now())).toBeLessThan(1_000);
  });
});

describe("formatting in an explicit zone", () => {
  const iso = "2026-10-07T21:30:00Z"; // 00:30 on the 8th in Kyiv (UTC+3), 21:30 on the 7th in UTC

  it("formatTime: the same moment reads differently per zone", () => {
    expect(formatTime(iso, "en-GB", "UTC")).toBe("21:30");
    expect(formatTime(iso, "en-GB", "Europe/Kyiv")).toBe("00:30");
  });

  it("formatDate/formatDateTime: the calendar day follows the zone", () => {
    expect(formatDate(iso, "en-GB", "UTC")).toBe("07 October 2026");
    expect(formatDate(iso, "en-GB", "Europe/Kyiv")).toBe("08 October 2026");
    expect(formatDateTime(iso, "en-GB", "Europe/Kyiv")).toBe("08/10/2026, 00:30");
  });

  it("empty and garbage input never becomes a fake 1970 date", () => {
    expect(formatTime("")).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDate("garbage")).toBe("garbage");
    expect(formatMoment(null, { hour: "2-digit" })).toBe("");
  });

  it("dayInZone: yyyy-MM-dd of a moment in a given zone (business day for API requests)", () => {
    const at = new Date("2026-10-07T21:30:00Z");
    expect(dayInZone("UTC", at)).toBe("2026-10-07");
    expect(dayInZone("Europe/Kyiv", at)).toBe("2026-10-08");
  });
});

describe("relative", () => {
  it("timeAgo: just now / minutes / hours, driven by the clock", () => {
    const base = Date.parse("2026-10-07T12:00:00Z");
    setClock(() => base);
    const ago = (s: number) => new Date(base - s * 1000).toISOString();
    expect(timeAgo(ago(10), "en-GB", LABELS)).toBe("now");
    expect(timeAgo(ago(5 * 60), "en-GB", LABELS)).toBe("5m");
    expect(timeAgo(ago(3 * 3600), "en-GB", LABELS)).toBe("3h");
    expect(timeAgo("garbage", "en-GB", LABELS)).toBe("");
  });

  it("dayLabel: today / yesterday / date; the year only for an earlier year", () => {
    const at = new Date(2026, 9, 7, 15, 0);
    expect(dayLabel(new Date(2026, 9, 7, 1, 0).toISOString(), "en-GB", LABELS, at)).toBe("T");
    expect(dayLabel(new Date(2026, 9, 6, 23, 0).toISOString(), "en-GB", LABELS, at)).toBe("Y");
    expect(dayLabel(new Date(2026, 8, 1, 12, 0).toISOString(), "en-GB", LABELS, at)).toBe("1 September");
    expect(dayLabel(new Date(2025, 8, 1, 12, 0).toISOString(), "en-GB", LABELS, at)).toBe("1 September 2025");
    expect(dayLabel("", "en-GB", LABELS, at)).toBe("");
  });

  it("dayKey: groups by the viewer's calendar day, falls back to the raw string for garbage", () => {
    expect(dayKey(new Date(2026, 8, 7, 12).toISOString())).toBe("2026-8-7");
    expect(dayKey("not a date")).toBe("not a date");
  });
});
