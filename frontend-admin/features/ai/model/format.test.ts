import { describe, expect, it } from "vitest";
import { uahFromCents, usdFromCents, usdFromMicro, usedPercent } from "./format";

const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("деньги ИИ", () => {
  it("центы в доллары: целые без копеек", () => {
    expect(usdFromCents(1000)).toBe("$10");
    expect(plain(usdFromCents(125))).toBe("$1,25");
  });

  it("микродоллары: доли цента не пропадают в ноль", () => {
    expect(usdFromMicro(0)).toBe("$0");
    expect(usdFromMicro(4_800)).toBe("< $0,01");
    expect(plain(usdFromMicro(12_500_000))).toBe("$12,50");
  });

  it("процент лимита: без лимита 0, не больше 100", () => {
    expect(usedPercent(5, 0)).toBe(0);
    expect(usedPercent(8_000_000, 10_000_000)).toBe(80);
    expect(usedPercent(20_000_000, 10_000_000)).toBe(100);
  });

  it("гривны из центов по курсу в копейках", () => {
    expect(plain(uahFromCents(1000, 4200))).toBe("420 ₴");
    expect(plain(uahFromCents(100, 4200))).toBe("42 ₴");
  });
});
