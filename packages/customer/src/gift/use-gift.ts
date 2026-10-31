"use client";

/** Текущий подарок (null — выключен, нет в наличии или ещё не загружен). Один запрос на все экраны. */
import { useQuery } from "@tanstack/react-query";
import type { GiftInfo } from "@shop/core/giftcase";
import type { GiftApi } from "./api";

export function useGiftInfo(api: Pick<GiftApi, "gift">, locale: string, enabled = true): GiftInfo | null {
  const { data } = useQuery({
    queryKey: ["gift", locale],
    queryFn: () => api.gift(),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return data?.gift ?? null;
}
