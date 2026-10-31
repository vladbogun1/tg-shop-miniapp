import { describe, expect, it } from "vitest";
import { isValidKey, keyFromLabel, optionValueFrom } from "./identifiers";

describe("keyFromLabel", () => {
  it("кириллица в snake_case латиницей", () => {
    expect(keyFromLabel("Вес")).toBe("ves");
    expect(keyFromLabel("Частота опроса")).toBe("chastota_oprosa");
  });

  it("ключ не начинается с цифры и не длиннее 48 знаков", () => {
    expect(keyFromLabel("2 кнопки")).toMatch(/^_2/);
    expect(keyFromLabel("а".repeat(100)).length).toBeLessThanOrEqual(48);
  });

  it("результат допустим как ключ, если начинается с буквы", () => {
    expect(isValidKey(keyFromLabel("Тип сенсора"))).toBe(true);
  });
});

describe("isValidKey", () => {
  it("латиница с буквы, цифры и _", () => {
    expect(isValidKey("dpi")).toBe(true);
    expect(isValidKey("polling_rate_2")).toBe(true);
  });

  it("отклоняет заглавные, цифру в начале, дефис, пустое и слишком длинное", () => {
    for (const bad of ["Dpi", "1dpi", "_dpi", "a-b", "", "ключ", "a".repeat(49)]) expect(isValidKey(bad)).toBe(false);
  });
});

describe("optionValueFrom", () => {
  it("нижний регистр латиницей, подчёркивания", () => {
    expect(optionValueFrom("Чёрный матовый")).toMatch(/^[a-z0-9_]+$/);
  });
});
