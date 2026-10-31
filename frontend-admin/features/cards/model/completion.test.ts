import { describe, expect, it } from "vitest";
import { publishProblem, translatedNote } from "./completion";

describe("translatedNote", () => {
  it("пусто без переводов, считает недостающий язык нулём", () => {
    expect(translatedNote(undefined)).toBe("");
    expect(translatedNote({ translated: { uk: 0, en: 0 } })).toBe("");
    expect(translatedNote({ translated: {} })).toBe("");
    expect(translatedNote({ translated: { uk: 3 } })).toBe(" · переводы UA 3 / EN 0");
  });
});

describe("publishProblem", () => {
  it("выложен или итога нет — проблемы нет", () => {
    expect(publishProblem(undefined, 0)).toBeNull();
    expect(publishProblem({ published: true }, 0)).toBeNull();
  });
  it("карточка осталась черновиком", () => {
    const p = publishProblem({ reason: "CARD_NOT_READY", message: "пусто" }, 100);
    expect(p?.needPrice).toBe(false);
    expect(p?.text).toContain("Карточка осталась черновиком — из ответа ИИ не сохранено ни характеристик, ни текстов (пусто).");
  });
  it("нет цены: по причине без цены, по missing и по тексту", () => {
    expect(publishProblem({ reason: "PRODUCT_NOT_PUBLISHABLE" }, 0)).toEqual({ text: "Не выложено: не указана цена.", needPrice: true });
    expect(publishProblem({ reason: "PRODUCT_NOT_PUBLISHABLE" }, 500)?.needPrice).toBe(false);
    expect(publishProblem({ missing: ["Price"] }, 500)?.needPrice).toBe(true);
    expect(publishProblem({ message: "нужна цена" }, 500)?.needPrice).toBe(true);
  });
  it("нет категории; цена и категория вместе; запасной текст", () => {
    expect(publishProblem({ missing: ["category"] }, 1)?.text).toContain("не выбрана категория");
    expect(publishProblem({ missing: ["price", "category"] }, 1)?.text).toBe(
      "Не выложено: не указана цена; не выбрана категория — примите категорию из ответа ИИ или задайте её в товаре."
    );
    expect(publishProblem({ reason: "X" }, 1)?.text).toBe("Не выложено: X.");
    expect(publishProblem({}, 1)?.text).toBe("Не выложено: сервер не выложил товар.");
  });
});
