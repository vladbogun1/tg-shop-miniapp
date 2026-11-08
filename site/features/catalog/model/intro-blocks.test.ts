import { describe, expect, it } from "vitest";
import { introBlocks } from "./intro-blocks";

describe("introBlocks", () => {
  it("splits paragraphs by blank lines and keeps single line breaks", () => {
    expect(introBlocks("Перший абзац.\n\nДругий,\nз переносом.")).toEqual([
      { kind: "paragraph", lines: ["Перший абзац."] },
      { kind: "paragraph", lines: ["Другий,", "з переносом."] },
    ]);
  });

  it("a short one-line paragraph without final punctuation is a heading", () => {
    expect(introBlocks("Як вибрати ігрову мишку\n\nДоставка та оплата")).toEqual([
      { kind: "heading", text: "Як вибрати ігрову мишку" },
      { kind: "heading", text: "Доставка та оплата" },
    ]);
  });

  it("a one-line sentence is not a heading, a lone short question is", () => {
    expect(introBlocks("До мишки варто взяти глайди.")[0].kind).toBe("paragraph");
    expect(introBlocks("Will these keycaps fit my keyboard?")[0].kind).toBe("heading");
  });

  it("question line + answer lines is a FAQ item", () => {
    expect(introBlocks("Скільки тримає батарея?\nВід кількох днів.\nЗалежно від моделі.")).toEqual([
      { kind: "qa", question: "Скільки тримає батарея?", answer: ["Від кількох днів.", "Залежно від моделі."] },
    ]);
  });

  it("handles CRLF and empty text", () => {
    expect(introBlocks("А\r\n\r\nБ.")).toHaveLength(2);
    expect(introBlocks("  \n\n ")).toEqual([]);
  });
});
