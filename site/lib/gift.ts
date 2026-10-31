"use client";

/**
 * The gift for the order sum / the gift case on the website (docs/GIFT-CASE.md): what the shop gives
 * and from which sum — GET /api/public/gift, no login. One shared query for the product page, the
 * cart (page + drawer) and the checkout; the clients count «add N more» themselves with
 * `giftProgress` from the product price / the cart total after the discount.
 */
import { giftProgress, type GiftInfo, type GiftProgress } from "@shop/core/giftcase";
import { showableGift } from "@shop/customer/gift/model";
import { useGiftInfo } from "@shop/customer/gift/use-gift";
import { useI18n } from "@/i18n/context";
import { api } from "./api";
import { useHydrated } from "./hooks";

/** The current gift (null = off / nothing in stock / not loaded yet). */
export function useGift(enabled = true): GiftInfo | null {
  const { locale } = useI18n();
  const hydrated = useHydrated();
  // Nothing to show: a case without prizes in stock / a product gift without the product.
  return showableGift(useGiftInfo(api.gift, locale, hydrated && enabled));
}

/** Progress of `totalMinor` to the gift; null without a (showable) gift. */
export function useGiftProgress(totalMinor: number, enabled = true): GiftProgress | null {
  const info = useGift(enabled);
  return info ? giftProgress(info, totalMinor) : null;
}
