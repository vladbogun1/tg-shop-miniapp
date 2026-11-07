import { describe, expect, it } from "vitest";
import { filterPalette, paletteItems } from "./palette-items";

describe("палитра разделов", () => {
  it("скрывает «Админы» и «Инциденты» от обычного админа", () => {
    const hrefs = paletteItems(false).map((i) => i.href);
    expect(hrefs).not.toContain("/admins");
    expect(hrefs).not.toContain("/incidents");
    expect(paletteItems(true).map((i) => i.href)).toContain("/admins");
  });
  it("ищет по названию и по разделу", () => {
    const all = paletteItems(true);
    expect(filterPalette(all, "товар").map((i) => i.href)).toContain("/products");
    expect(filterPalette(all, "система").length).toBeGreaterThan(2);
    expect(filterPalette(all, "")).toHaveLength(all.length);
    expect(filterPalette(all, "zzzz")).toHaveLength(0);
  });
});
