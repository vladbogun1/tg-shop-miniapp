import { describe, expect, it } from "vitest";
import { EMPTY_PROMO_FORM, editWarning, firstError, initialForm, promoBody, promoErrors } from "./form";
import { filterCodes, filterManual, groupByTab, isLive, promoOrigin, tabFromSearch, tabSearch } from "./promo";
import type { ManualDiscountOrder, PromoCode } from "./types";

const code = (o: Partial<PromoCode>): PromoCode => ({ id: "1", code: "AAA", active: true, ...o }) as PromoCode;
const NOW = Date.parse("2026-10-31T12:00:00Z");

describe("promoOrigin", () => {
  it("поле бэкенда важнее; для старого бэкенда — по источнику и владельцу", () => {
    expect(promoOrigin(code({ origin: "REVIEW" }))).toBe("REVIEW");
    expect(promoOrigin(code({ source: "REVIEW_BONUS" }))).toBe("REVIEW");
    expect(promoOrigin(code({ ownerUserId: 5 }))).toBe("PERSONAL");
    expect(promoOrigin(code({}))).toBe("OURS");
  });
});

describe("isLive", () => {
  it("выключен, истёк, исчерпан — не действует", () => {
    expect(isLive(code({}), NOW)).toBe(true);
    expect(isLive(code({ active: false }), NOW)).toBe(false);
    expect(isLive(code({ expiresAt: "2026-10-01T00:00:00Z" }), NOW)).toBe(false);
    expect(isLive(code({ expiresAt: "2026-12-01T00:00:00Z" }), NOW)).toBe(true);
    expect(isLive(code({ maxUses: 2, usesCount: 2 }), NOW)).toBe(false);
    expect(isLive(code({ maxUses: 2, usesCount: 1 }), NOW)).toBe(true);
  });
});

describe("вкладки и фильтры", () => {
  const list = [
    code({ id: "a", code: "SUMMER" }),
    code({ id: "b", code: "PERS", ownerUserId: 777 }),
    code({ id: "c", code: "REV", origin: "REVIEW", active: false }),
  ];
  it("groupByTab", () => {
    const g = groupByTab(list);
    expect([g.OURS.length, g.PERSONAL.length, g.REVIEW.length]).toEqual([1, 1, 1]);
  });
  it("поиск по коду и Telegram id, состояние", () => {
    expect(filterCodes(list, " summ ", "all", NOW).map((p) => p.id)).toEqual(["a"]);
    expect(filterCodes(list, "77", "all", NOW).map((p) => p.id)).toEqual(["b"]);
    expect(filterCodes(list, "", "off", NOW).map((p) => p.id)).toEqual(["c"]);
    expect(filterCodes(list, "", "live", NOW).map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("ручные скидки — только в «Персональных» и не при «Не действуют»", () => {
    const m = [{ id: "ABC123", label: "Ручная скидка 10%", customerName: "Иван", tgUserId: 9 }] as ManualDiscountOrder[];
    expect(filterManual(m, "OURS", "", "all")).toEqual([]);
    expect(filterManual(m, "PERSONAL", "", "off")).toEqual([]);
    expect(filterManual(m, "PERSONAL", "иван", "all")).toHaveLength(1);
    expect(filterManual(m, "PERSONAL", "abc", "live")).toHaveLength(1);
    expect(filterManual(m, "PERSONAL", "9", "all")).toHaveLength(1);
    expect(filterManual(m, "PERSONAL", "zzz", "all")).toEqual([]);
  });
  it("вкладка в адресе", () => {
    expect(tabFromSearch("?tab=review")).toBe("REVIEW");
    expect(tabFromSearch("?tab=zzz")).toBeNull();
    expect(tabFromSearch("")).toBeNull();
    expect(tabSearch("OURS")).toBe("");
    expect(tabSearch("PERSONAL")).toBe("?tab=personal");
  });
});

describe("форма", () => {
  it("правка кода с суммой открывается в режиме «₴»", () => {
    const f = initialForm(code({ discountAmountMinor: 15050, maxUses: 3 }));
    expect(f).toMatchObject({ mode: "amount", amountMajor: "150.5", maxUses: "3", percent: "", active: true });
    expect(initialForm(null)).toEqual(EMPTY_PROMO_FORM);
  });
  it("ошибки процента, суммы, потолка и лимита", () => {
    expect(promoErrors({ ...EMPTY_PROMO_FORM }).percent).toBe("Укажите процент");
    expect(promoErrors({ ...EMPTY_PROMO_FORM, percent: "101" }).percent).toBe("Целое число от 1 до 100");
    expect(promoErrors({ ...EMPTY_PROMO_FORM, percent: "10" }).percent).toBeNull();
    expect(promoErrors({ ...EMPTY_PROMO_FORM, mode: "amount" }).amount).toBe("Укажите сумму больше 0");
    expect(promoErrors({ ...EMPTY_PROMO_FORM, mode: "amount", amountMajor: "0" }).amount).toBe("Укажите сумму больше 0");
    expect(promoErrors({ ...EMPTY_PROMO_FORM, percent: "5", capMajor: "0" }).cap).toBe("Сумма больше 0 или пусто");
    expect(promoErrors({ ...EMPTY_PROMO_FORM, percent: "5", maxUses: "0" }).maxUses).toBe("Целое число от 1 или пусто");
    expect(firstError({ percent: null, amount: null, cap: "c", maxUses: "m" })).toBe("c");
  });
  it("тело запроса: процент с потолком / сумма, код в верхнем регистре", () => {
    expect(promoBody({ ...EMPTY_PROMO_FORM, code: " sale ", percent: "5", capMajor: "100", maxUses: "10" })).toEqual({
      code: "SALE",
      discountPercent: 5,
      discountAmountMinor: null,
      maxDiscountMinor: 10000,
      maxUses: 10,
      active: true,
    });
    expect(promoBody({ ...EMPTY_PROMO_FORM, code: "x", mode: "amount", amountMajor: "50", capMajor: "9" })).toMatchObject({
      discountPercent: null,
      discountAmountMinor: 5000,
      maxDiscountMinor: 0,
      maxUses: null,
    });
  });
  it("предупреждение о правке использованного кода", () => {
    expect(editWarning(code({ code: "AAA", usesCount: 4 }), "aaa")).toEqual({ uses: 4, renamed: false });
    expect(editWarning(code({ code: "AAA", usesCount: 4 }), "BBB")).toEqual({ uses: 4, renamed: true });
    expect(editWarning(null, "x")).toEqual({ uses: 0, renamed: false });
  });
});
