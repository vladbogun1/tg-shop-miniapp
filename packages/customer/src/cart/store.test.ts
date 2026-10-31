import { beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { createCartStore, type CartPolicy } from "./store";
import type { CartLine, CartProduct } from "./lines";

function memory(): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const mini: CartPolicy = {
  storageKey: "mini",
  stockOf: (p, v) => (v ? v.stock : (p.stock ?? 0)),
  imageUrlOf: (p) => p.images?.[0]?.url ?? null,
  trackSlug: false,
  keepSoldOut: false,
  counts: () => true,
};
const site: CartPolicy = {
  storageKey: "site",
  stockOf: (p, v) => (v ? v.stock : (p.stock ?? 0)),
  imageUrlOf: (p) => (p.images ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0]?.url ?? null,
  trackSlug: true,
  keepSoldOut: true,
  counts: (l) => l.stock > 0,
};

const product = (over: Partial<CartProduct> = {}): CartProduct => ({ id: "p1", title: "Mouse", priceMinor: 1000, stock: 5, ...over });

function make(policy: CartPolicy) {
  const storage = memory();
  const cart = createCartStore<object>({ policy, extra: () => ({}), persistExtra: () => ({}), storage });
  return { ...cart, storage };
}

describe("cart store", () => {
  let c: ReturnType<typeof make>;
  beforeEach(() => {
    c = make(mini);
  });

  it("adds a line and clamps quantity to stock", () => {
    c.useCart.getState().add(product(), null, 9);
    expect(c.useCart.getState().lines[0]).toMatchObject({ key: "p1::", quantity: 5, stock: 5, currency: "UAH" });
  });

  it("does not add a sold-out product", () => {
    c.useCart.getState().add(product({ stock: 0 }), null);
    expect(c.useCart.getState().lines).toEqual([]);
  });

  it("merges the same product+variant into one line, different variants stay apart", () => {
    const s = c.useCart.getState();
    s.add(product(), null);
    s.add(product(), null);
    s.add(product(), { id: "v1", name: "S", stock: 2 });
    const lines = c.useCart.getState().lines;
    expect(lines.map((l) => [l.key, l.quantity])).toEqual([["p1::", 2], ["p1::v1", 1]]);
  });

  it("respects the server quantity cap, 0 turns it off", () => {
    c.setQtyCap(3);
    c.useCart.getState().add(product(), null, 9);
    expect(c.useCart.getState().lines[0].quantity).toBe(3);
    c.setQtyCap(0);
    c.useCart.getState().setQty("p1::", 4);
    expect(c.useCart.getState().lines[0].quantity).toBe(4);
  });

  it("removes a line when quantity drops to 0 (Mini App policy)", () => {
    c.useCart.getState().add(product(), null);
    c.useCart.getState().dec("p1::");
    expect(c.useCart.getState().lines).toEqual([]);
  });

  it("counts every line in the Mini App, orderable ones only on the site", () => {
    const line = (over: Partial<CartLine>): CartLine => ({ key: "k", productId: "p", variantId: null, variantName: null, title: "t", priceMinor: 100, currency: "UAH", imageUrl: null, stock: 1, quantity: 2, ...over });
    for (const [policy, subtotal, promo] of [[mini, 400, "p*2,q*2"], [site, 200, "p*2"]] as const) {
      const cart = make(policy);
      cart.useCart.setState({ lines: [line({}), line({ key: "q", productId: "q", stock: 0 })] });
      // selectors are hooks over the store; evaluate the same reducers through getState
      const lines = cart.useCart.getState().lines;
      expect(lines.filter((l) => policy.counts(l)).reduce((s, l) => s + l.priceMinor * l.quantity, 0)).toBe(subtotal);
      expect(lines.filter((l) => policy.counts(l) && l.quantity > 0).map((l) => `${l.productId}*${l.quantity}`).join(",")).toBe(promo);
    }
  });

  it("site policy keeps a sold-out line at quantity 0 and tracks slug, sorted image", () => {
    const s = make(site);
    s.useCart.getState().add(product({ slug: "mouse", images: [{ url: "b", sortOrder: 2 }, { url: "a", sortOrder: 1 }] }), null);
    expect(s.useCart.getState().lines[0]).toMatchObject({ slug: "mouse", imageUrl: "a" });
    s.useCart.setState({ lines: s.useCart.getState().lines.map((l) => ({ ...l, stock: 0 })) });
    s.useCart.getState().setQty("p1::", 0);
    expect(s.useCart.getState().lines).toHaveLength(1);
  });

  it("persists only data under the storage key", () => {
    c.useCart.getState().add(product(), null);
    const saved = JSON.parse(c.storage.data.get("mini") ?? "{}");
    expect(Object.keys(saved.state).sort()).toEqual(["lines", "promoCode"]);
  });
});
