"use client";

/**
 * Gift for the order sum / gift case (docs/GIFT-CASE.md): what the shop gives from which sum.
 * Its own endpoint and its own switch on the server.
 * The progress («buy N more») is computed by the callers with `giftProgress` from the shared package:
 * on a product page from the product price, in the cart and at checkout from the total after discounts.
 */
import { useQuery } from "@tanstack/react-query";
import type { GiftInfo } from "@shop/core/giftcase";
import { useI18n } from "@/i18n/context";
import { customerApi } from "@/lib/api";

/** The current gift (null = off, nothing in stock or not loaded yet). One request is shared by every screen. */
export function useGift(): GiftInfo | null {
  const { locale } = useI18n();
  const { data } = useQuery({
    queryKey: ["gift", locale],
    queryFn: () => customerApi.getGift(),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return data?.gift ?? null;
}
