import { CONTENT_SOURCE_LOCALE, FALLBACK_LOCALE, LOCALES, LOCALE_NAME, LOCALE_SHORT, LOCALE_TAG, TRANSLATED_LOCALES } from "@shop/core/i18n";
import { describe, expect, it } from "vitest";
import { alternates, makeT, stripLocale } from "./index";

/** Каждый язык из списка обязан быть целиком: словарь, подписи, hreflang, URL-сегмент. */
describe("список языков", () => {
  it.each([...LOCALES])("%s: словарь отвечает, подписи и тег заданы", (l) => {
    expect(makeT(l)("common.back" as never)).toBeTruthy();
    expect(LOCALE_NAME[l]).toBeTruthy();
    expect(LOCALE_SHORT[l]).toBeTruthy();
    expect(LOCALE_TAG[l]).toBeTruthy();
  });

  it("hreflang есть для каждого языка и для x-default", () => {
    const langs = alternates("/catalog", FALLBACK_LOCALE).languages;
    expect(Object.keys(langs).sort()).toEqual([...LOCALES, "x-default"].sort());
    expect(langs["x-default"]).toBe("/catalog");
  });

  it.each([...LOCALES])("%s: префикс снимается обратно", (l) => {
    const url = alternates("/catalog/x", l).canonical;
    expect(stripLocale(url)).toBe("/catalog/x");
  });

  it("переводимые языки — все, кроме исходного", () => {
    expect([...TRANSLATED_LOCALES, CONTENT_SOURCE_LOCALE].sort()).toEqual([...LOCALES].sort());
  });
});
