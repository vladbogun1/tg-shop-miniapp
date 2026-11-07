import { describe, expect, it } from "vitest";
import type { SettingItem } from "../api";
import { isDirty, parse, rebaseDraft, validate } from "./draft";

const base = { key: "k", label: "L", description: "", group: "g", overridden: false, defaultValue: 3, value: 3 };
const int = { ...base, type: "INT", min: 1, max: 10 } as unknown as SettingItem;
const text = { ...base, type: "STRING", maxLength: 5, value: "", defaultValue: "" } as unknown as SettingItem;

describe("validate", () => {
  it("INT: целое в пределах", () => {
    expect(validate(int, "5")).toBeNull();
    expect(validate(int, " -2 ")).toBe("Не меньше 1");
    expect(validate(int, "11")).toBe("Не больше 10");
    expect(validate(int, "abc")).toBe("Нужно целое число");
    expect(validate(int, "1.5")).toBe("Нужно целое число");
  });
  it("STRING: одна строка и длина", () => {
    expect(validate(text, "abc")).toBeNull();
    expect(validate(text, "a\nb")).toBe("Только одна строка");
    expect(validate(text, "abcdef")).toBe("Не длиннее 5 символов");
  });
});

describe("parse / isDirty", () => {
  it("INT парсится в число, изменение отмечается", () => {
    expect(parse(int, " 7 ")).toBe(7);
    expect(isDirty(int, { raw: "5", reset: false })).toBe(true);
    expect(isDirty(int, { raw: "3", reset: false })).toBe(false);
  });
});

describe("rebaseDraft", () => {
  const bool = { ...base, key: "b", type: "BOOL", value: false, defaultValue: false } as unknown as SettingItem;
  const limit = { ...int, key: "n", value: 3 } as unknown as SettingItem;

  it("a switch saved on its own keeps the number still being typed", () => {
    const draft = { b: { raw: true, reset: false }, n: { raw: "7", reset: false } };
    const fresh = [{ ...bool, value: true, overridden: true }, limit];
    expect(rebaseDraft([bool, limit], draft, fresh)).toEqual({ b: { raw: true, reset: false }, n: { raw: "7", reset: false } });
  });

  it("after saving everything the form is clean again", () => {
    const draft = { b: { raw: true, reset: false }, n: { raw: "7", reset: false } };
    const fresh = [{ ...bool, value: true }, { ...limit, value: 7 }];
    const d = rebaseDraft([bool, limit], draft, fresh);
    expect(fresh.some((it) => isDirty(it, d[it.key]))).toBe(false);
  });

  it("a value another admin changed replaces an untouched field", () => {
    const fresh = [bool, { ...limit, value: 9 }];
    expect(rebaseDraft([bool, limit], { b: { raw: false, reset: false }, n: { raw: "3", reset: false } }, fresh).n.raw).toBe("9");
  });
});
