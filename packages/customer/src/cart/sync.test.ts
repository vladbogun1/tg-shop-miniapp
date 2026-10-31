import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartLineInput, ServerCart, ServerCartLine } from "@shop/core/cart";
import type { StateStorage } from "zustand/middleware";
import type { Platform } from "../platform/platform";
import type { CartApi } from "./api";
import { lineKey, type CartLine } from "./lines";
import { createCartStore } from "./store";
import { createCartSync, type CartSyncPolicy } from "./sync";

const mem = (): StateStorage => {
  const d = new Map<string, string>();
  return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => void d.set(k, v), removeItem: (k) => void d.delete(k) };
};

const sline = (id: string, quantity: number, over: Partial<ServerCartLine> = {}): ServerCartLine => ({
  productId: id, variantId: null, quantity, title: id, slug: null, variantName: null, imageUrl: null, priceMinor: 100,
  compareAtMinor: null, currency: "UAH", stock: 10, available: true, problem: null, addedAt: "", ...over,
});
const scart = (lines: ServerCartLine[], version = 1): ServerCart => ({ version, updatedAt: null, lines, maxLines: 50, maxQuantity: 10 });

/** Сервер-фейк: merge берёт большее количество, put заменяет. */
function fakeServer(initial: ServerCartLine[] = []) {
  let lines = initial;
  const calls: string[] = [];
  const api: CartApi = {
    get: vi.fn(async () => { calls.push("get"); return scart(lines); }),
    put: vi.fn(async (inputs: CartLineInput[]) => { calls.push("put"); lines = inputs.map((i) => sline(i.productId, i.quantity)); return scart(lines); }),
    merge: vi.fn(async (inputs: CartLineInput[]) => {
      calls.push("merge");
      const by = new Map(lines.map((l) => [lineKey(l.productId, l.variantId), l]));
      for (const i of inputs) {
        const k = lineKey(i.productId, i.variantId);
        const cur = by.get(k);
        by.set(k, sline(i.productId, Math.max(cur?.quantity ?? 0, i.quantity)));
      }
      lines = [...by.values()];
      return scart(lines);
    }),
  };
  return { api, calls, set: (l: ServerCartLine[]) => (lines = l) };
}

function setup(server = fakeServer()) {
  const cart = createCartStore<{ migrated: boolean }>({
    policy: { storageKey: "t", stockOf: (p, v) => (v ? v.stock : (p.stock ?? 0)), imageUrlOf: () => null, trackSlug: false, keepSoldOut: false, counts: () => true },
    extra: () => ({ migrated: false }),
    persistExtra: (s) => ({ migrated: s.migrated }),
    storage: mem(),
  });
  let token = true;
  const fg = new Set<() => void>();
  const bg = new Set<() => void>();
  const unload = vi.fn();
  const platform: Platform = {
    kind: "telegram",
    canCallApi: () => token,
    onForeground: (cb) => (fg.add(cb), () => fg.delete(cb)),
    onBackground: (cb) => (bg.add(cb), () => bg.delete(cb)),
    putCartOnUnload: unload,
  };
  type S = ReturnType<typeof cart.useCart.getState>;
  const policy: CartSyncPolicy<S> = {
    fromServer(c) {
      const visible: CartLine[] = [];
      const hidden: CartLineInput[] = [];
      const synced: CartLineInput[] = [];
      for (const s of c.lines) {
        const input = { productId: s.productId, variantId: s.variantId, quantity: s.quantity };
        if (!s.available) { hidden.push(input); continue; }
        synced.push(input);
        visible.push({ key: lineKey(s.productId, s.variantId), productId: s.productId, variantId: s.variantId, variantName: null, title: s.title, priceMinor: s.priceMinor, currency: "UAH", imageUrl: null, stock: s.stock, quantity: Math.max(1, Math.min(s.quantity, s.stock)) });
      }
      return { patch: { lines: visible }, hidden, synced };
    },
    shouldMergeLocal: (st, edited) => !st.migrated || edited,
    started: { migrated: true },
    wantStart: () => token,
  };
  const sync = createCartSync({ store: cart.useCart, api: server.api, platform, policy });
  return { cart, sync, server, platform, unload, setToken: (v: boolean) => (token = v), foreground: () => fg.forEach((f) => f()), background: () => bg.forEach((f) => f()) };
}

const p = (id: string, stock = 10) => ({ id, title: id, priceMinor: 100, stock });

describe("cart sync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("first start merges the local cart into the server one (larger quantity wins), then the server is the truth", async () => {
    const server = fakeServer([sline("a", 1), sline("b", 4)]);
    const t = setup(server);
    t.cart.useCart.getState().add(p("a"), null, 3);
    t.cart.useCart.getState().add(p("c"), null, 1);
    await t.sync.start();
    expect(server.calls).toEqual(["merge"]);
    const lines = t.cart.useCart.getState().lines.map((l) => [l.productId, l.quantity]);
    expect(lines).toEqual([["a", 3], ["b", 4], ["c", 1]]);
    expect(t.cart.useCart.getState().migrated).toBe(true);
  });

  it("after migration start adopts the server cart without a merge", async () => {
    const server = fakeServer([sline("x", 2)]);
    const t = setup(server);
    t.cart.useCart.setState({ migrated: true, lines: [] });
    await t.sync.start();
    expect(server.calls).toEqual(["get"]);
    expect(t.cart.useCart.getState().lines.map((l) => l.productId)).toEqual(["x"]);
  });

  it("writes a local change 400 ms after the last one, once", async () => {
    const t = setup();
    t.cart.useCart.setState({ migrated: true });
    t.sync.attach();
    await t.sync.start();
    t.cart.useCart.getState().add(p("a"), null, 1);
    await vi.advanceTimersByTimeAsync(300);
    t.cart.useCart.getState().add(p("a"), null, 1);
    await vi.advanceTimersByTimeAsync(399);
    expect(t.server.api.put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(t.server.api.put).toHaveBeenCalledTimes(1);
    expect(t.server.api.put).toHaveBeenCalledWith([{ productId: "a", variantId: null, quantity: 2 }]);
  });

  it("does not talk to the API while the platform says no (no token yet), merges edits made meanwhile", async () => {
    const server = fakeServer([sline("s", 1)]);
    const t = setup(server);
    t.cart.useCart.setState({ migrated: true });
    t.setToken(false);
    const detach = t.sync.attach();
    t.cart.useCart.getState().add(p("a"), null, 1); // edited before start
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.calls).toEqual([]);
    t.setToken(true);
    await t.sync.start();
    expect(server.calls).toEqual(["merge"]);
    detach();
  });

  it("keeps unsellable server lines out of the store but sends them back with every write", async () => {
    const server = fakeServer([sline("gone", 2, { available: false, stock: 0 }), sline("ok", 1)]);
    const t = setup(server);
    t.cart.useCart.setState({ migrated: true });
    t.sync.attach();
    await t.sync.start();
    expect(t.cart.useCart.getState().lines.map((l) => l.productId)).toEqual(["ok"]);
    t.cart.useCart.getState().add(p("n"), null, 1);
    await vi.advanceTimersByTimeAsync(450);
    const sent = (t.server.api.put as ReturnType<typeof vi.fn>).mock.calls[0][0] as CartLineInput[];
    expect(sent.map((l) => l.productId).sort()).toEqual(["gone", "n", "ok"]);
  });

  it("clamps a server quantity to stock and writes the clamp back", async () => {
    const server = fakeServer([sline("a", 9, { stock: 3 })]);
    const t = setup(server);
    t.cart.useCart.setState({ migrated: true });
    t.sync.attach();
    await t.sync.start();
    expect(t.cart.useCart.getState().lines[0].quantity).toBe(3);
    await vi.advanceTimersByTimeAsync(450);
    expect(t.server.api.put).toHaveBeenCalledWith([{ productId: "a", variantId: null, quantity: 3 }]);
  });

  it("flushCart sends the pending write now", async () => {
    const t = setup();
    t.cart.useCart.setState({ migrated: true });
    t.sync.attach();
    await t.sync.start();
    t.cart.useCart.getState().add(p("a"), null, 1);
    await t.sync.flushCart();
    expect(t.server.api.put).toHaveBeenCalledTimes(1);
  });

  it("backgrounding with a pending write sends it with keepalive instead of the timer", async () => {
    const t = setup();
    t.cart.useCart.setState({ migrated: true });
    t.sync.attach();
    await t.sync.start();
    t.cart.useCart.getState().add(p("a"), null, 1);
    t.background();
    expect(t.unload).toHaveBeenCalledWith([{ productId: "a", variantId: null, quantity: 1 }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.server.api.put).not.toHaveBeenCalled();
  });

  it("foreground re-reads the server cart, at most once per 2 s", async () => {
    const t = setup(fakeServer([sline("a", 1)]));
    t.cart.useCart.setState({ migrated: true });
    t.sync.attach();
    await t.sync.start();
    t.server.set([sline("a", 1), sline("z", 1)]);
    await vi.advanceTimersByTimeAsync(2100);
    t.foreground();
    t.foreground();
    await vi.advanceTimersByTimeAsync(10);
    expect(t.server.api.get).toHaveBeenCalledTimes(2); // start + one refresh
    expect(t.cart.useCart.getState().lines.map((l) => l.productId)).toEqual(["a", "z"]);
  });

  it("after an order the ordered lines leave locally without a write, then the cart is re-read", async () => {
    const t = setup(fakeServer([sline("a", 1), sline("b", 1)]));
    t.cart.useCart.setState({ migrated: true });
    t.sync.attach();
    await t.sync.start();
    t.server.set([sline("b", 1)]); // the server removed the ordered line itself
    t.sync.cartAfterOrder(["a::"]);
    await vi.advanceTimersByTimeAsync(10);
    expect(t.server.api.put).not.toHaveBeenCalled();
    expect(t.cart.useCart.getState().lines.map((l) => l.productId)).toEqual(["b"]);
  });

  it("stop() resets the local copy and switches writes off", async () => {
    const t = setup(fakeServer([sline("a", 1)]));
    t.cart.useCart.setState({ migrated: true });
    t.sync.attach();
    await t.sync.start();
    t.sync.stop({ lines: [], promoCode: "" });
    expect(t.sync.isActive()).toBe(false);
    expect(t.cart.useCart.getState().lines).toEqual([]);
    t.cart.useCart.getState().add(p("q"), null, 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.server.api.put).not.toHaveBeenCalled();
  });
});
