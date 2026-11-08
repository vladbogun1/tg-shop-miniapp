import { describe, expect, it } from "vitest";
import { productsSelectHref, selectedFromParam } from "./select-link";

describe("ссылка «выбрать товары»", () => {
  it("туда и обратно: только известные, без повторов", () => {
    expect(productsSelectHref(["a", "b c"])).toBe("/products?select=a,b%20c");
    const raw = new URLSearchParams("select=a,zz,a,%20b").get("select");
    expect(selectedFromParam(raw, new Set(["a", "b"]))).toEqual(["a", "b"]);
    expect(selectedFromParam(null, new Set(["a"]))).toEqual([]);
  });
});
