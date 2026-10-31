import { describe, expect, it, vi } from "vitest";
import { swallowPromoEnter } from "./promo";

describe("swallowPromoEnter", () => {
  it("Enter: отменяет отправку формы", () => {
    const preventDefault = vi.fn();
    expect(swallowPromoEnter({ key: "Enter", preventDefault })).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("Enter при IME-вводе не трогаем", () => {
    const preventDefault = vi.fn();
    expect(swallowPromoEnter({ key: "Enter", nativeEvent: { isComposing: true }, preventDefault })).toBe(false);
    expect(swallowPromoEnter({ key: "Enter", isComposing: true, preventDefault })).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("другие клавиши не трогаем", () => {
    const preventDefault = vi.fn();
    expect(swallowPromoEnter({ key: "a", preventDefault })).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
