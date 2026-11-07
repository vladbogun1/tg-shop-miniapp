"use client";

import { STALE_TIME } from "@shop/core/query";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { searchApi } from "./api";
import { searchKeys } from "./keys";
import { MIN_QUERY, normalizeQuery } from "./model/hits";

/** Заказы, товары и покупатели для палитры Ctrl+K; не спрашивает, пока запрос короче двух символов. */
export function useAdminSearch(raw: string) {
  const q = normalizeQuery(raw);
  return useQuery({
    queryKey: searchKeys.find(q),
    queryFn: () => searchApi.find(q),
    enabled: q.length >= MIN_QUERY,
    staleTime: STALE_TIME.quick,
    placeholderData: keepPreviousData,
  });
}
