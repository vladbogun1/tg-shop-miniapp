"use client";

/**
 * Gift for the order sum / gift case (docs/GIFT-CASE.md): what the shop gives from which sum.
 * Its own endpoint and its own switch on the server.
 * The progress («buy N more») is computed by the callers with `giftProgress` from the shared package:
 * on a product page from the product price, in the cart and at checkout from the total after discounts.
 */
import type { GiftInfo } from "@shop/core/giftcase";
import { useGiftInfo } from "@shop/customer/gift/use-gift";
import { useI18n } from "@/i18n/context";
import { customerApi } from "@/lib/api";

/** The current gift (null = off, nothing in stock or not loaded yet). One request is shared by every screen. */
export function useGift(): GiftInfo | null {
  const { locale } = useI18n();
  return useGiftInfo(customerApi.gift, locale);
}
