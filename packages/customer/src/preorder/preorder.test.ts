import { describe, expect, it, vi } from "vitest";
import { createPreorderApi } from "./api";
import { buildPreorderIndex } from "./coming";
import { preorderKeys } from "./keys";
import { heldFor, isLive, isLiveHold, queuedFor, type ComingBatch, type MyPreorder, type PreorderEta } from "./types";

const eta = (from: string): PreorderEta => ({ stage: "ordered", mode: "DATE", from, to: null, approxWeeks: null, note: null });

function mine(over: Partial<MyPreorder>): MyPreorder {
  return {
    id: 1,
    productId: "p1",
    variantId: null,
    productTitle: "T",
    productSlug: "t",
    imageUrl: null,
    variantName: null,
    qty: 1,
    status: "WAITING",
    position: 1,
    heldQty: 0,
    holdUntil: null,
    createdAt: "2026-10-01T00:00:00Z",
    eta: null,
    ...over,
  };
}

describe("индекс партий", () => {
  const batches: ComingBatch[] = [
    { eta: eta("2026-11-01"), holdHours: 12, lines: [{ productId: "a", variantId: null }, { productId: "b", variantId: "b1" }] },
    { eta: eta("2026-12-01"), holdHours: 48, lines: [{ productId: "a", variantId: null }, { productId: "b", variantId: "b2" }] },
  ];
  const idx = buildPreorderIndex(batches);

  it("побеждает ближайшая партия; варианты и товар без вариантов раздельно", () => {
    expect(idx.any.get("a")?.from).toBe("2026-11-01");
    expect(idx.products.get("a")?.from).toBe("2026-11-01");
    expect(idx.variants.get("b::b1")?.from).toBe("2026-11-01");
    expect(idx.variants.get("b::b2")?.from).toBe("2026-12-01");
    expect(idx.products.has("b")).toBe(false);
    expect(idx.size).toBe(2);
  });

  it("порядок товаров и срок брони берутся с первой партии товара", () => {
    expect(idx.order).toEqual(["a", "b"]);
    expect(idx.holdHours.get("a")).toBe(12);
    expect(idx.holdHours.get("b")).toBe(12);
  });
});

describe("статусы мест", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");

  it("isLive: ждёт, держится или известили", () => {
    expect(isLive("WAITING") && isLive("HELD") && isLive("NOTIFIED")).toBe(true);
    expect(isLive("BOUGHT")).toBe(false);
  });

  it("бронь идёт, пока holdUntil в будущем и есть held", () => {
    expect(isLiveHold(mine({ status: "HELD", heldQty: 1, holdUntil: "2026-10-30T18:00:00Z" }), now)).toBe(true);
    expect(isLiveHold(mine({ status: "HELD", heldQty: 1, holdUntil: "2026-10-30T11:00:00Z" }), now)).toBe(false);
    expect(isLiveHold(mine({ status: "HELD", heldQty: 0, holdUntil: "2026-10-30T18:00:00Z" }), now)).toBe(false);
  });

  it("heldFor и queuedFor ищут по строке товар + вариант", () => {
    const list = [
      mine({ id: 1, status: "HELD", heldQty: 1, holdUntil: "2026-10-30T18:00:00Z" }),
      mine({ id: 2, productId: "p2", variantId: "v", status: "NOTIFIED" }),
    ];
    expect(heldFor(list, "p1", null, now)?.id).toBe(1);
    expect(heldFor(list, "p1", "v", now)).toBeUndefined();
    expect(queuedFor(list, "p2", "v")?.id).toBe(2);
    expect(queuedFor(list, "p1", null)).toBeUndefined();
  });
});

describe("api и ключи предзаказов", () => {
  it("пути, тело подписки и обёртка authed только для закрытых вызовов", async () => {
    const http = { get: vi.fn().mockResolvedValue([]), post: vi.fn().mockResolvedValue({}), del: vi.fn().mockResolvedValue(undefined) };
    const spy = vi.fn();
    const authed = <T,>(call: () => Promise<T>) => {
      spy();
      return call();
    };
    const api = createPreorderApi(http, authed);
    await api.coming();
    await api.forProductPublic("p");
    expect(http.get.mock.calls.map((c) => c[0])).toEqual(["/api/public/preorders", "/api/public/products/p/preorder"]);
    expect(spy).not.toHaveBeenCalled();
    await api.forProduct("p");
    await api.mine();
    await api.subscribe("p", undefined, 2);
    await api.leave(7);
    expect(spy).toHaveBeenCalledTimes(4);
    expect(http.post).toHaveBeenCalledWith("/api/me/preorders", { productId: "p", variantId: undefined, qty: 2 });
    expect(http.del).toHaveBeenCalledWith("/api/me/preorders/7");
  });

  it("ключи приложений остались прежними", () => {
    expect(preorderKeys.mineInApp).toEqual(["me", "preorders"]);
    expect(preorderKeys.mineOnSite).toEqual(["preorders", "mine"]);
    expect(preorderKeys.product("p")).toEqual(["preorders", "product", "p"]);
    expect(preorderKeys.product("p", true)).toEqual(["preorders", "product", "p", true]);
  });
});
