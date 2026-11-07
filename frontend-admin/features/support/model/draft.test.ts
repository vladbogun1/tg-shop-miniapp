import { describe, expect, it } from "vitest";
import { withTemplate } from "./draft";

describe("withTemplate", () => {
  it("в пустое поле кладёт текст как есть", () => {
    expect(withTemplate("", "Привіт")).toBe("Привіт");
    expect(withTemplate("  \n ", "Привіт")).toBe("Привіт");
  });

  it("к набранному добавляет с новой строки, без лишних пробелов в конце", () => {
    expect(withTemplate("Добрий день  \n", "Привіт")).toBe("Добрий день\nПривіт");
  });
});
