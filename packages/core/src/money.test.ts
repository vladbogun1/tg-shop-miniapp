import { describe, expect, it } from "vitest";
import { money, toMajor, toMinor } from "./money";

const plain = (s: string) => s.replace(/\s/g, " ");

describe("money", () => {
  it("shows whole amounts without decimals and keeps the currency sign", () => {
    expect(plain(money(103000, "UAH", "ru-RU"))).toBe("1 030 ₴");
    expect(plain(money(0))).toBe("0 ₴");
    expect(plain(money(null))).toBe("0 ₴");
  });

  it("shows kopecks whenever there are any (95 kopecks is never rounded to 1 ₴)", () => {
    expect(plain(money(95, "UAH", "ru-RU"))).toBe("0,95 ₴");
  });

  it("rounds fractional minor units like the backend (half up)", () => {
    expect(plain(money(100.4))).toBe("1 ₴");
  });
});

describe("toMinor / toMajor", () => {
  it("converts typed major units to minor, accepting a decimal comma", () => {
    expect(toMinor("12,5")).toBe(1250);
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor("abc")).toBe(0);
    expect(toMinor(null)).toBe(0);
  });

  it("converts minor to major for editing", () => {
    expect(toMajor(1250)).toBe(12.5);
    expect(toMajor(undefined)).toBe(0);
  });
});
