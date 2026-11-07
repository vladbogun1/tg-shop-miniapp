import { describe, expect, it } from "vitest";
import { undoFieldParts, undoneText, undoStaysText } from "./undo-fields";

describe("ключи журнала применений словами", () => {
  it("группирует характеристики, фото и переводы, держит постоянный порядок", () => {
    const keys = ["status", "photo:a.webp", "spec:dpi", "tr:uk:title", "description", "photo:b.webp", "spec:weight", "tr:en:description", "tr:uk:description", "active"];
    expect(undoFieldParts(keys)).toEqual([
      "описание",
      "характеристики (2)",
      "фото (2)",
      "перевод uk: название, описание",
      "перевод en: описание",
      "статус карточки",
      "выкладка на витрину",
    ]);
  });
  it("одна характеристика — по имени, незнакомый ключ — как есть", () => {
    expect(undoFieldParts(["spec:dpi", "odd"])).toEqual(["характеристика «dpi»", "odd"]);
  });
});

describe("итог отмены", () => {
  it("без ручных правок — только число", () => {
    expect(undoneText({ reverted: 5, skipped: 0, skippedFields: [] })).toBe("Применение отменено: возвращено — 5");
  });
  it("называет то, что правили вручную после применения", () => {
    expect(undoneText({ reverted: 3, skipped: 2, skippedFields: ["tr:uk:title", "status"] })).toBe(
      "Применение отменено: возвращено — 3. Не отменено — после применения изменили вручную: перевод uk: название; статус карточки",
    );
  });
  it("что останется: бренд и цена — только если применение их касалось", () => {
    expect(undoStaysText(["description"])).toBe("поле, которое после применения изменили вручную, останется как есть");
    expect(undoStaysText(["brand", "active"])).toContain("новый бренд, если его завело применение, останется в «Брендах»");
    expect(undoStaysText(["brand", "active"])).toContain("цена, введённая при выкладке, останется");
  });
});
