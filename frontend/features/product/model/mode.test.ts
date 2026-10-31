import { describe, expect, it } from "vitest";
import { purchaseMode, stockOf, withHeldStock } from "./mode";

describe("purchaseMode", () => {
  it("variant first, then buy / pre-order / out", () => {
    expect(purchaseMode(true, "in_stock", false)).toBe("pick");
    expect(purchaseMode(false, "held", false)).toBe("buy");
    expect(purchaseMode(false, "preorder", false)).toBe("pre");
    expect(purchaseMode(false, "out_of_stock", true)).toBe("pre");
    expect(purchaseMode(false, "out_of_stock", false)).toBe("out");
  });
});

describe("stock", () => {
  it("variant stock wins when the product has variants", () => {
    expect(stockOf({ stock: 5 }, { stock: 2 }, true)).toBe(2);
    expect(stockOf({ stock: 5 }, null, true)).toBe(0);
    expect(stockOf({ stock: 5 }, null, false)).toBe(5);
  });
  it("held unit raises the stock shown", () => {
    const r = withHeldStock({ stock: 0 }, null, false, true, 1);
    expect(r.buyProduct.stock).toBe(1);
  });
});
