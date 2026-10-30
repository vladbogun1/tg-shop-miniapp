import type { Product, ProductVariant } from "@shop/core/types";
import { describe, expect, it } from "vitest";
import { stockOf } from "./stock";

const product = (over: Partial<Product>) => ({ id: "p", title: "t", priceMinor: 100, ...over }) as Product;

describe("stockOf", () => {
  it("uses the chosen variant's own stock", () => {
    const v: ProductVariant = { name: "black", stock: 3 };
    expect(stockOf(product({ stock: 99 }), v)).toBe(3);
  });

  it("sums variants (ignoring negatives) when no variant is chosen", () => {
    const p = product({ variants: [{ name: "a", stock: 2 }, { name: "b", stock: -5 }, { name: "c", stock: 4 }] });
    expect(stockOf(p, null)).toBe(6);
  });

  it("falls back to the product stock, then to 0", () => {
    expect(stockOf(product({ stock: 7 }), null)).toBe(7);
    expect(stockOf(product({}), null)).toBe(0);
  });
});
