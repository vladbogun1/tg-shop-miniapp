import { describe, expect, it } from "vitest";
import { fold, matchesQuery } from "./search";

describe("поиск по настройкам", () => {
  it("украинское написание находит русское и наоборот", () => {
    expect(matchesQuery(["Нова пошта"], "почта")).toBe(true);
    expect(matchesQuery(["Новая Почта"], "пошта")).toBe(true);
    expect(matchesQuery(["Відділення"], "отделение")).toBe(false);
    expect(matchesQuery(["Миттєві статуси"], "миттеви")).toBe(true);
  });
  it("регистр, ё и пустой запрос", () => {
    expect(fold("Ёлка ЇЖАК")).toBe("елка ижак");
    expect(matchesQuery(["что угодно"], "  ")).toBe(true);
    expect(matchesQuery([null, undefined, "Коробки"], "КОРОБ")).toBe(true);
    expect(matchesQuery(["Коробки"], "вебхук")).toBe(false);
  });
});
