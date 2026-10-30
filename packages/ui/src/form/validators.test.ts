import { describe, expect, it } from "vitest";
import { email, max, maxLength, min, minLength, pattern, required, validateAll } from "./validators";

describe("validators", () => {
  it("required: пробелы и пустой массив — пусто", () => {
    expect(required()("  ")).toBe("required");
    expect(required()([])).toBe("required");
    expect(required()("x")).toBeUndefined();
  });
  it("minLength/pattern/email пропускают пустое", () => {
    expect(minLength(3)("")).toBeUndefined();
    expect(minLength(3)("ab")).toBe("tooShort");
    expect(pattern(/^\d+$/)("a")).toBe("invalid");
    expect(email()("a@b")).toBe("invalidEmail");
    expect(email()("a@b.co")).toBeUndefined();
  });
  it("maxLength, min, max", () => {
    expect(maxLength(2)("abc")).toBe("tooLong");
    expect(min(1)(0)).toBe("tooSmall");
    expect(max(5)(6)).toBe("tooBig");
  });
  it("validateAll берёт первую ошибку поля", () => {
    const res = validateAll({ name: "", age: 1 }, { name: [required(), minLength(3)], age: [min(5)] });
    expect(res).toEqual({ name: "required", age: "tooSmall" });
    expect(validateAll({ name: "abc" }, { name: [required()] })).toEqual({});
  });
});
