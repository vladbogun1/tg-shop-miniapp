"use client";

/**
 * The gift for the order sum / the gift case on the website (docs/GIFT-CASE.md): what the shop gives
 * and from which sum — GET /api/public/gift, no login. One shared query for the product page, the
 * cart (page + drawer) and the checkout; the clients count «add N more» themselves with
 * `giftProgress` from the product price / the cart total after the discount. Independent of
 * «Разом дешевше» (works with the bundle switched off, and the other way round).
 */
import { useQuery } from "@tanstack/react-query";
import { giftProgress, type GiftInfo, type GiftProgress } from "@shop/shared";
import { useI18n } from "@/i18n/context";
import { api } from "./api";
import { useHydrated } from "./hooks";

/** The current gift (null = off / nothing in stock / not loaded yet). */
export function useGift(enabled = true): GiftInfo | null {
  const { locale } = useI18n();
  const hydrated = useHydrated();
  const { data } = useQuery({
    queryKey: ["gift", locale],
    queryFn: () => api.gift(),
    enabled: hydrated && enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const g = data?.gift;
  if (!g) return null;
  // Nothing to show: a case without prizes in stock / a product gift without the product.
  return g.kind === "CASE" ? (g.caseItems?.length ? g : null) : g.product ? g : null;
}

/** Progress of `totalMinor` to the gift; null without a (showable) gift. */
export function useGiftProgress(totalMinor: number, enabled = true): GiftProgress | null {
  const info = useGift(enabled);
  return info ? giftProgress(info, totalMinor) : null;
}
