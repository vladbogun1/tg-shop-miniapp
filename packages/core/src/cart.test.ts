import { describe, expect, it } from "vitest";
import { cartSignature } from "./cart";

describe("cartSignature", () => {
  it("does not depend on line order", () => {
    const a = { productId: "p1", variantId: null, quantity: 2 };
    const b = { productId: "p2", variantId: "v1", quantity: 1 };
    expect(cartSignature([a, b])).toBe(cartSignature([b, a]));
  });

  it("changes with quantity, variant and product", () => {
    const base = cartSignature([{ productId: "p1", variantId: null, quantity: 1 }]);
    expect(cartSignature([{ productId: "p1", variantId: null, quantity: 2 }])).not.toBe(base);
    expect(cartSignature([{ productId: "p1", variantId: "v", quantity: 1 }])).not.toBe(base);
    expect(cartSignature([{ productId: "p2", variantId: null, quantity: 1 }])).not.toBe(base);
    expect(cartSignature([])).toBe("");
  });
});
