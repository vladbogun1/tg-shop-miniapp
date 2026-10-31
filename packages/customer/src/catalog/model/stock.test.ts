import { describe, expect, it } from "vitest";
import { productInStock, stockOf } from "./stock";

const product = (over: { stock?: number | null; variants?: { name: string; stock: number }[] | null }) => ({ id: "p", ...over });

describe("stockOf", () => {
  it("uses the chosen variant's own stock", () => {
    expect(stockOf(product({ stock: 99 }), { stock: 3 })).toBe(3);
  });

  it("sums variants (ignoring negatives) when no variant is chosen", () => {
    const p = product({ variants: [{ name: "a", stock: 2 }, { name: "b", stock: -5 }, { name: "c", stock: 4 }] });
    expect(stockOf(p, null)).toBe(6);
  });

  it("falls back to the product stock, then to 0", () => {
    expect(stockOf(product({ stock: 7 }), null)).toBe(7);
    expect(stockOf(product({}), null)).toBe(0);
    expect(stockOf(product({ stock: null }), null)).toBe(0);
  });
});

describe("productInStock", () => {
  it("is true for a product or any of its variants in stock", () => {
    expect(productInStock(product({ stock: 1 }))).toBe(true);
    expect(productInStock(product({ stock: 0, variants: [{ name: "a", stock: 0 }, { name: "b", stock: 2 }] }))).toBe(true);
  });
  it("is false when nothing is in stock", () => {
    expect(productInStock(product({ stock: 0 }))).toBe(false);
    expect(productInStock(product({ variants: [{ name: "a", stock: 0 }] }))).toBe(false);
  });
});
