import type { GiftInfo, GiftProgress, GiftTierInfo } from "@shop/core/giftcase";
import { describe, expect, it, vi } from "vitest";
import { createGiftApi } from "./api";
import { giftKeys } from "./keys";
import { giftView, showableGift } from "./model";

const tier = (name: string, thresholdMinor: number, prizes: number): GiftTierInfo =>
  ({
    tier: name,
    thresholdMinor,
    prizes: Array.from({ length: prizes }, (_, i) => ({ key: `${name}${i}`, kind: "PRODUCT", rarity: "COMMON", title: `P${i}` })),
  }) as unknown as GiftTierInfo;

const progress = (over: Partial<GiftProgress>): GiftProgress =>
  ({ kind: "CASE", thresholdMinor: 100, product: null, tiers: [], tier: null, next: null, remainingMinor: 0, reached: false, share: 0, ...over }) as GiftProgress;

describe("giftView", () => {
  const bronze = tier("BRONZE", 100, 2);
  const silver = tier("SILVER", 200, 1);

  it("кейс: достигнутый уровень, иначе следующий, иначе первый", () => {
    expect(giftView(progress({ tiers: [bronze, silver], tier: silver, reached: true }))?.shownTier).toBe(silver);
    expect(giftView(progress({ tiers: [bronze, silver], next: bronze }))?.shownTier).toBe(bronze);
    expect(giftView(progress({ tiers: [bronze, silver] }))?.shownTier).toBe(bronze);
  });

  it("нет призов на показанном уровне или нет товара: показывать нечего", () => {
    expect(giftView(progress({ tiers: [tier("BRONZE", 100, 0)] }))).toBeNull();
    expect(giftView(progress({ kind: "PRODUCT", product: null }))).toBeNull();
    expect(giftView(null)).toBeNull();
  });

  it("done: подарок заработан", () => {
    expect(giftView(progress({ tiers: [bronze], tier: bronze, reached: true }))?.done).toBe(true);
    expect(giftView(progress({ tiers: [bronze] }))?.done).toBe(false);
  });
});

describe("showableGift", () => {
  it("кейс без призов и подарок без товара скрыты", () => {
    expect(showableGift({ kind: "CASE", tiers: [tier("BRONZE", 1, 0)] } as unknown as GiftInfo)).toBeNull();
    expect(showableGift({ kind: "PRODUCT", product: null, tiers: [] } as unknown as GiftInfo)).toBeNull();
    const ok = { kind: "CASE", tiers: [tier("BRONZE", 1, 1)] } as unknown as GiftInfo;
    expect(showableGift(ok)).toBe(ok);
    expect(showableGift(undefined)).toBeNull();
  });
});

describe("api и ключи подарка", () => {
  it("пути кейса; authed только у закрытых вызовов", async () => {
    const http = { get: vi.fn().mockResolvedValue({ gift: null }), post: vi.fn().mockResolvedValue({}) };
    const spy = vi.fn();
    const authed = <T,>(call: () => Promise<T>) => {
      spy();
      return call();
    };
    const api = createGiftApi(http, authed);
    await api.gift();
    expect(spy).not.toHaveBeenCalled();
    await api.openCase("o1");
    await api.swapCase("o1");
    await api.chooseSize("o1", "v9");
    expect(http.post.mock.calls).toEqual([
      ["/api/me/orders/o1/gift-case/open"],
      ["/api/me/orders/o1/gift-case/swap"],
      ["/api/me/orders/o1/gift-case/size", { variantId: "v9" }],
    ]);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("ключи", () => {
    expect(giftKeys.info("uk")).toEqual(["gift", "uk"]);
    expect(giftKeys.orders()).toEqual(["me", "orders"]);
  });
});
