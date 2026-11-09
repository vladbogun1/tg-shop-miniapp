import { describe, expect, it } from "vitest";
import { EMPTY_PROMO_FORM, PROMO_PRESETS, applyPreset, editWarning, exampleOf, expiryAfterDays, expiryDay, firstError, shopToday, initialForm, promoBody, promoErrors, randomCode, toggleBody } from "./form";
import { filterCodes, filterManual, groupByTab, isLive, mainStatus, orderTotals, promoOrigin, summaryOf, tabFromSearch, tabSearch } from "./promo";
import type { ManualDiscountOrder, PromoCode } from "./types";

const code = (o: Partial<PromoCode>): PromoCode => ({ id: "1", code: "AAA", active: true, ...o }) as PromoCode;
const NOW = Date.parse("2026-10-31T12:00:00Z");

describe("promoOrigin", () => {
  it("берёт поле бэкенда как есть", () => {
    expect(promoOrigin(code({ origin: "REVIEW" }))).toBe("REVIEW");
    expect(promoOrigin(code({ origin: "PERSONAL" }))).toBe("PERSONAL");
    expect(promoOrigin(code({ origin: "OURS" }))).toBe("OURS");
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
    code({ id: "a", code: "SUMMER", origin: "OURS" }),
    code({ id: "b", code: "PERS", ownerUserId: 777, origin: "PERSONAL" }),
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
    expect(firstError({ percent: null, amount: null, cap: "c", maxUses: "m", expiresOn: "e" })).toBe("c");
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

describe("сводка и главный статус", () => {
  const live = code({ id: "l", maxUses: 5, usesCount: 1, reservedCount: 2 });
  it("считает действующие, резерв и истекающие", () => {
    const soon = code({ id: "s", expiresAt: "2026-11-02T00:00:00Z" });
    const off = code({ id: "o", active: false, reservedCount: 1 });
    expect(summaryOf([live, soon, off], NOW)).toEqual({ live: 2, reserved: 3, expiring: 1, stopped: 0 });
  });
  it("включён, но лимит исчерпан или срок прошёл — «Остановлены», выключенные не считаются", () => {
    const used = code({ id: "u", maxUses: 2, usesCount: 2 });
    const old = code({ id: "e", expiresAt: "2026-10-01T00:00:00Z" });
    const offUsed = code({ id: "x", active: false, maxUses: 1, usesCount: 1 });
    expect(summaryOf([used, old, offUsed, live], NOW)).toEqual({ live: 1, reserved: 2, expiring: 0, stopped: 2 });
  });
  it("приоритет статусов", () => {
    expect(mainStatus(code({ active: false, maxUses: 1, usesCount: 1 }), NOW)).toBe("off");
    expect(mainStatus(code({ maxUses: 1, usesCount: 1 }), NOW)).toBe("exhausted");
    expect(mainStatus(code({ expiresAt: "2026-10-01T00:00:00Z" }), NOW)).toBe("expired");
    expect(mainStatus(code({ maxUses: 3, usesCount: 1, reservedCount: 2 }), NOW)).toBe("reserve");
    expect(mainStatus(live, NOW)).toBe("live");
  });
  it("итоги заказов", () => {
    expect(orderTotals([{ discountMinor: 10, totalMinor: 100 }, { discountMinor: 5, totalMinor: 50 }])).toEqual({
      count: 2,
      discountMinor: 15,
      totalMinor: 150,
    });
  });
});

describe("пресеты и пример", () => {
  it("пресет переключает режим", () => {
    const v = { ...EMPTY_PROMO_FORM, mode: "percent" as const };
    expect(applyPreset(v, PROMO_PRESETS[3]).mode).toBe("amount");
    expect(applyPreset(applyPreset(v, PROMO_PRESETS[3]), PROMO_PRESETS[0])).toMatchObject({ mode: "percent", percent: "5" });
  });
  it("пример с потолком и без, скрыт при ошибке", () => {
    const f = { ...EMPTY_PROMO_FORM, percent: "5" };
    expect(exampleOf(f, promoErrors(f))?.discountMinor).toBe(10000);
    const c = { ...f, capMajor: "50" };
    expect(exampleOf(c, promoErrors(c))?.discountMinor).toBe(5000);
    const bad = { ...EMPTY_PROMO_FORM, percent: "500" };
    expect(exampleOf(bad, promoErrors(bad))).toBeNull();
  });
  it("случайный код — 8 допустимых знаков", () => {
    expect(randomCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });
});

describe("срок «до»", () => {
  const full = { ...EMPTY_PROMO_FORM, code: "X", percent: "5" };
  it("день существующего срока — по Киеву; нет срока — пусто", () => {
    expect(expiryDay(code({ expiresAt: "2026-11-30T21:59:59Z" }))).toBe("2026-11-30");
    expect(expiryDay(code({ expiresAt: "2026-11-30T22:00:00Z" }))).toBe("2026-12-01");
    expect(expiryDay(code({}))).toBe("");
    expect(initialForm(code({ expiresAt: "2026-11-20T08:15:00Z", discountPercent: 5 })).expiresOn).toBe("2026-11-20");
  });
  it("«сегодня» и чипы 7 / 30 / 90 дн. считаются от киевского дня", () => {
    expect(shopToday(NOW)).toBe("2026-10-31");
    expect(expiryAfterDays(7, NOW)).toBe("2026-11-07");
    expect(expiryAfterDays(30, NOW)).toBe("2026-11-30");
    expect(expiryAfterDays(90, NOW)).toBe("2027-01-29");
    // 23:30 UTC — в Киеве уже следующий день.
    expect(shopToday(Date.parse("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
  });
  it("прошедшая дата — ошибка; сегодня, будущее и пусто — нормально", () => {
    expect(promoErrors({ ...full, expiresOn: "2026-10-30" }, "", NOW).expiresOn).toBe("Срок в прошлом");
    expect(promoErrors({ ...full, expiresOn: "2026-10-31" }, "", NOW).expiresOn).toBeNull();
    expect(promoErrors({ ...full, expiresOn: "2026-12-01" }, "", NOW).expiresOn).toBeNull();
    expect(promoErrors({ ...full, expiresOn: "" }, "", NOW).expiresOn).toBeNull();
    expect(firstError(promoErrors({ ...full, expiresOn: "2026-10-30" }, "", NOW))).toBe("Срок в прошлом");
  });
  it("истёкший код можно править, не трогая дату", () => {
    expect(promoErrors({ ...full, expiresOn: "2026-10-01" }, "2026-10-01", NOW).expiresOn).toBeNull();
    expect(promoErrors({ ...full, expiresOn: "2026-10-02" }, "2026-10-01", NOW).expiresOn).toBe("Срок в прошлом");
  });
  it("тело: дата не менялась — полей срока нет; новая — expiresOn; стёрта — noExpiry", () => {
    expect(promoBody({ ...full, expiresOn: "2026-11-20" }, "2026-11-20")).not.toHaveProperty("expiresOn");
    expect(promoBody({ ...full, expiresOn: "2026-11-20" }, "2026-11-20")).not.toHaveProperty("noExpiry");
    expect(promoBody({ ...full, expiresOn: "" }, "")).not.toHaveProperty("noExpiry");
    expect(promoBody({ ...full, expiresOn: "2026-12-01" }, "2026-11-20")).toMatchObject({ expiresOn: "2026-12-01" });
    expect(promoBody({ ...full, expiresOn: "2026-12-01" }, "")).toMatchObject({ expiresOn: "2026-12-01" });
    expect(promoBody({ ...full, expiresOn: "" }, "2026-11-20")).toMatchObject({ noExpiry: true });
  });
  it("быстрое вкл/выкл срок не трогает (коды из кейса и за отзыв)", () => {
    const b = toggleBody(code({ discountPercent: 10, expiresAt: "2026-11-20T08:15:00Z", origin: "CASE" }), false);
    expect(b).not.toHaveProperty("expiresOn");
    expect(b).not.toHaveProperty("noExpiry");
  });
});

describe("вкладка «Из кейса»", () => {
  it("коды из кейса попадают в свою вкладку, адрес ?tab=case", () => {
    const g = groupByTab([code({ id: "x", origin: "CASE" }), code({ id: "y", origin: "PERSONAL" })]);
    expect(g.CASE.map((p) => p.id)).toEqual(["x"]);
    expect(g.PERSONAL.map((p) => p.id)).toEqual(["y"]);
    expect(tabFromSearch("?tab=case")).toBe("CASE");
    expect(tabSearch("CASE")).toBe("?tab=case");
  });
});

describe("toggleBody", () => {
  it("сохраняет остальные поля", () => {
    expect(toggleBody(code({ code: "X", discountPercent: 10, discountAmountMinor: 0, maxDiscountMinor: 500, maxUses: 3 }), false)).toEqual({
      code: "X",
      discountPercent: 10,
      discountAmountMinor: null,
      maxDiscountMinor: 500,
      maxUses: 3,
      active: false,
    });
    expect(toggleBody(code({ discountPercent: 0, discountAmountMinor: 10000 }), true).discountAmountMinor).toBe(10000);
  });
});
