import { describe, expect, it } from "vitest";
import { EMPTY_COMPOSE, filledVersions, MAX_LEN, plainText, startBody, testBody, testRecipient, textProblems } from "./compose";
import { draftOf, userLabel, valuesFromHistory } from "./draft";
import type { BroadcastHistoryItem } from "./types";

describe("textProblems", () => {
  it("пусто — проблем нет", () => {
    expect(textProblems({ main: "", uk: "", ru: "", en: "" })).toEqual([]);
  });
  it("длиннее лимита: подпись языка только у не-основных", () => {
    const long = "а".repeat(MAX_LEN + 1);
    expect(textProblems({ main: long, uk: "", ru: long, en: "" })).toEqual([
      `длиннее ${MAX_LEN} символов (${MAX_LEN + 1})`,
      `Слишком длинно: ${MAX_LEN + 1} из ${MAX_LEN} символов`,
      `RU: длиннее ${MAX_LEN} символов (${MAX_LEN + 1})`,
      `RU: Слишком длинно: ${MAX_LEN + 1} из ${MAX_LEN} символов`,
    ]);
  });
  it("битый HTML попадает в проблемы первой ошибкой", () => {
    expect(textProblems({ main: "<b>x", uk: "", ru: "", en: "" })).toHaveLength(1);
  });
});

describe("startBody / testBody", () => {
  it("пустые версии и кнопка — undefined, язык и основной текст как есть", () => {
    const body = startBody({ ...EMPTY_COMPOSE, main: "hi", uk: " ", ru: "привет", buttonText: "  " });
    expect(body).toEqual({
      text: "hi",
      textUk: undefined,
      textRu: "привет",
      textEn: undefined,
      audience: "all",
      lang: "",
      withButton: true,
      buttonText: undefined,
    });
    expect(testBody("t", undefined, { withButton: false, buttonText: " x " })).toEqual({
      text: "t",
      telegramUserId: undefined,
      withButton: false,
      buttonText: "x",
    });
  });
});

describe("testRecipient", () => {
  it("введённый id важнее выбранного; ноль и мусор — null", () => {
    expect(testRecipient(" 42 ", 7)).toBe(42);
    expect(testRecipient("", 7)).toBe(7);
    expect(testRecipient("", null)).toBeNull();
    expect(testRecipient("abc", 7)).toBeNull();
    expect(testRecipient("0", null)).toBeNull();
  });
});

describe("черновик и история", () => {
  it("пустые тексты без кнопки — черновика нет, с кнопкой — есть", () => {
    expect(draftOf(EMPTY_COMPOSE)).toBeNull();
    expect(draftOf({ ...EMPTY_COMPOSE, buttonText: "go" })?.buttonText).toBe("go");
  });
  it("«В черновик» не трогает текст кнопки", () => {
    const h = { text: "T", textUk: null, textRu: "R", audience: "premium", lang: "uk", withButton: false } as unknown as BroadcastHistoryItem;
    const p = valuesFromHistory(h);
    expect(p).toEqual({ main: "T", uk: "", ru: "R", en: "", audience: "premium", lang: "uk", withButton: false });
    expect("buttonText" in p).toBe(false);
  });
  it("userLabel и версии", () => {
    expect(userLabel({ firstName: "A", lastName: "B", telegramUserId: 1 })).toBe("A B");
    expect(userLabel({ username: "u", telegramUserId: 1 })).toBe("@u");
    expect(userLabel({ telegramUserId: 1 })).toBe("#1");
    expect(filledVersions({ main: "m", uk: "u", ru: " ", en: "e" })).toEqual(["uk", "en"]);
    expect(plainText("<b>a</b> b")).toBe("a b");
  });
});
