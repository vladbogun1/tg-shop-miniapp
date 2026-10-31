import { describe, expect, it } from "vitest";
import type { ReplyTemplate } from "../api";
import { bodyLabel, canSaveDraft, draftOf, isDraftDirty, isTranslationStale, toWrite } from "./templates";

const tpl = (over: Partial<ReplyTemplate> = {}): ReplyTemplate =>
  ({
    id: 1,
    title: "Привет",
    bodyRu: "Здравствуйте",
    bodyUk: "Вітаю",
    bodyEn: "Hi",
    sort: 3,
    ukStale: true,
    enStale: false,
    ...over,
  }) as ReplyTemplate;

describe("isDraftDirty", () => {
  it("совпадает с сохранённым — не грязный", () => {
    expect(isDraftDirty(tpl(), draftOf(tpl()))).toBe(false);
  });
  it("любая правка — грязный; новый шаблон с пустым — не грязный", () => {
    expect(isDraftDirty(tpl(), { ...draftOf(tpl()), en: "Hello" })).toBe(true);
    expect(isDraftDirty(null, draftOf(null))).toBe(false);
  });
});

describe("isTranslationStale", () => {
  it("устарел, пока перевод и русский не тронуты", () => {
    expect(isTranslationStale(tpl(), "uk", draftOf(tpl()))).toBe(true);
  });
  it("правка перевода или русского снимает пометку", () => {
    expect(isTranslationStale(tpl(), "uk", { ...draftOf(tpl()), uk: "Привіт" })).toBe(false);
    expect(isTranslationStale(tpl(), "uk", { ...draftOf(tpl()), ru: "Добрый день" })).toBe(false);
  });
  it("без флага с сервера — не устарел", () => {
    expect(isTranslationStale(tpl(), "en", draftOf(tpl()))).toBe(false);
  });
});

describe("toWrite / canSaveDraft / bodyLabel", () => {
  it("обрезает пробелы и сохраняет порядок", () => {
    expect(toWrite({ title: " a ", ru: " б ", uk: " ", en: "" }, 3)).toEqual({ title: "a", bodyRu: "б", bodyUk: "", bodyEn: "", sort: 3 });
  });
  it("сохранить можно только с названием и русским текстом", () => {
    expect(canSaveDraft({ title: "a", ru: " ", uk: "", en: "" })).toBe(false);
    expect(canSaveDraft({ title: "a", ru: "б", uk: "", en: "" })).toBe(true);
  });
  it("подпись поля: русский обязателен", () => {
    expect(bodyLabel("ru")).toContain("обязательно");
    expect(bodyLabel("en")).toContain("English");
  });
});
