import { describe, expect, it } from "vitest";
import { bucketLabel, duration, monthLabel, pct, shortId, uah, uahExact, uahShort } from "./format";

// ru-RU разделяет разряды неразрывным пробелом (U+00A0) — приводим к обычному, чтобы тест читался.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("деньги", () => {
  it("uah округляет до гривны, uahExact показывает копейки только когда они есть", () => {
    expect(plain(uah(12345600))).toBe("123 456 ₴");
    expect(plain(uah(null))).toBe("0 ₴");
    expect(plain(uahExact(123400))).toBe("1 234 ₴");
    expect(plain(uahExact(123450))).toBe("1 234,50 ₴");
  });

  it("uahShort: до 10 тыс — целые, дальше «тыс», от миллиона «млн»", () => {
    expect(plain(uahShort(950000))).toBe("9 500 ₴");
    expect(plain(uahShort(12345600))).toBe("123 тыс ₴");
    expect(plain(uahShort(120000000))).toBe("1,2 млн ₴");
  });
});

describe("числа и подписи", () => {
  it("pct и duration", () => {
    expect(pct(null)).toBe("—");
    expect(plain(pct(12.34))).toBe("12,3%");
    expect(plain(pct(12.345, 2))).toBe("12,35%");
    expect(duration(null)).toBe("—");
    expect(duration(0.1)).toBe("6 мин");
    expect(plain(duration(5.44))).toBe("5,4 ч");
    expect(plain(duration(74))).toBe("3,1 дн");
  });

  it("подписи корзин и месяцев", () => {
    expect(bucketLabel("2026-10-04")).toBe("04.10");
    expect(bucketLabel("2026-10-04", "WEEK")).toBe("с 04.10");
    expect(bucketLabel("2026-10-04T15")).toBe("15:00");
    expect(bucketLabel("")).toBe("");
    expect(monthLabel("2026-10")).toBe("окт 2026");
    expect(monthLabel("2026-10", true)).toBe("октябрь");
    expect(shortId("abcdef0123456789")).toBe("abcdef01");
  });
});
