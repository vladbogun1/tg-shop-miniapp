import { describe, expect, it } from "vitest";
import { parseChoice, resolveCollapsed } from "./use-collapsed-sidebar";

describe("сайдбар: свёрнутость", () => {
  it("читает выбор из хранилища", () => {
    expect(parseChoice("1")).toBe("collapsed");
    expect(parseChoice("0")).toBe("expanded");
    expect(parseChoice(null)).toBeNull();
    expect(parseChoice("x")).toBeNull();
  });
  it("без выбора: узкий экран свёрнут, широкий развёрнут", () => {
    expect(resolveCollapsed(null, true)).toBe(true);
    expect(resolveCollapsed(null, false)).toBe(false);
  });
  it("явный выбор главнее ширины", () => {
    expect(resolveCollapsed("expanded", true)).toBe(false);
    expect(resolveCollapsed("collapsed", false)).toBe(true);
  });
});
