"use client";

/** Текущий подарок (null — выключен, нет в наличии или ещё не загружен). Один запрос на все экраны. */
import { useQuery } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@shop/core/query";
import type { GiftInfo } from "@shop/core/giftcase";
import type { GiftApi } from "./api";
import { giftKeys } from "./keys";

export function useGiftInfo(api: Pick<GiftApi, "gift">, locale: string, enabled = true): GiftInfo | null {
  const { data } = useQuery({
    queryKey: giftKeys.info(locale),
    queryFn: () => api.gift(),
    enabled,
    staleTime: QUERY_PRESETS.static.staleTime,
    retry: 1,
  });
  return data?.gift ?? null;
}
