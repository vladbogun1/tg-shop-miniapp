import { describe, expect, it } from "vitest";
import { giftWarnings, hasGiftProblem } from "./gift-warnings";

describe("giftWarnings", () => {
  it("нет на складе, скрыт, не выбран", () => {
    const empty = giftWarnings({ product: { stock: 0 }, productId: "p", on: true, isCase: false });
    expect(empty.map((w) => w.text)).toEqual(["Подарка нет на складе — покупатели его не увидят, пока не появится."]);
    expect(hasGiftProblem(empty)).toBe(true);
    const hidden = giftWarnings({ product: { stock: 5, active: false }, productId: "p", on: true, isCase: false });
    expect(hidden[0].text).toMatch(/скрыт/);
    const none = giftWarnings({ product: null, productId: "", on: true, isCase: false });
    expect(none[0].text).toMatch(/не выбран/);
  });
  it("выключенный подарок без товара — без предупреждения", () => {
    expect(giftWarnings({ product: null, productId: "", on: false, isCase: false })).toEqual([]);
  });
  it("варианты: уйдёт тот, которого больше", () => {
    const w = giftWarnings({
      product: { stock: 0, variants: [{ name: "A", stock: 1 }, { name: "B", stock: 7 }] } as never,
      productId: "p",
      on: false,
      isCase: false,
    });
    expect(w[0].text).toContain("«B», 7 шт");
  });
  it("режим кейса: пояснение про запасной подарок", () => {
    const w = giftWarnings({ product: null, productId: "", on: true, isCase: true });
    expect(w).toHaveLength(1);
    expect(w[0].text).toContain("не выбран");
    expect(hasGiftProblem(w)).toBe(false);
  });
});
