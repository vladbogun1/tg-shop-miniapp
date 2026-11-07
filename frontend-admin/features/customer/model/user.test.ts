import { describe, expect, it } from "vitest";
import type { UserCardDto } from "./types";
import { stubUserCard, displayName, initials, languageLine, telegramHref, userLang } from "./user";

const base: UserCardDto = stubUserCard({ telegramUserId: 123456, username: null, firstName: null });

describe("user model", () => {
  it("displayName: имя, потом @username, потом #id", () => {
    expect(displayName({ ...base, firstName: "Ivan", lastName: "Petrov" })).toBe("Ivan Petrov");
    expect(displayName({ ...base, firstName: "Ivan" })).toBe("Ivan");
    expect(displayName({ ...base, username: "ivan" })).toBe("@ivan");
    expect(displayName(base)).toBe("#123456");
  });

  it("initials: первые буквы имени и фамилии, иначе username, иначе начало id", () => {
    expect(initials({ ...base, firstName: "ivan", lastName: "petrov" })).toBe("IP");
    expect(initials({ ...base, username: "zed" })).toBe("Z");
    expect(initials(base)).toBe("12");
  });

  it("userLang: язык магазина, запасной — Telegram с пометкой, иначе прочерк", () => {
    expect(userLang({ ...base, locale: "uk" })).toEqual({ label: "UA", fromTelegram: false });
    expect(userLang({ ...base, locale: "de" })).toEqual({ label: "DE", fromTelegram: false });
    expect(userLang({ ...base, languageCode: "ru-RU" })).toEqual({ label: "RU", fromTelegram: true });
    expect(userLang(base)).toEqual({ label: "—", fromTelegram: false });
  });

  it("languageLine и ссылка в Telegram", () => {
    expect(languageLine({ ...base, locale: "uk" })).toBe("язык магазина: Украинский");
    expect(languageLine({ ...base, locale: "de" })).toBe("язык магазина: de");
    expect(languageLine({ ...base, languageCode: "en" })).toBe("язык Telegram: en");
    expect(languageLine(base)).toBe("");
    expect(telegramHref({ ...base, username: "ivan" })).toBe("https://t.me/ivan");
    expect(telegramHref(base)).toBe("tg://user?id=123456");
  });
});

describe("avgCheckMinor / languageDetail", () => {
  it("средний чек: без заказов 0, иначе округление", async () => {
    const { avgCheckMinor, languageDetail } = await import("./user");
    expect(avgCheckMinor({ ordersCount: 0, totalSpentMinor: 500 })).toBe(0);
    expect(avgCheckMinor({ ordersCount: 3, totalSpentMinor: 1000 })).toBe(333);
    expect(languageDetail(base)).toBe("не определён");
  });
});
