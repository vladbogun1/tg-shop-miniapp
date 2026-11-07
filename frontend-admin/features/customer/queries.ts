"use client";

import { QUERY_PRESETS } from "@shop/core/query";
import type { TimeRange } from "@shop/core/types";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { SortDir } from "@/lib/sort";
import { customerApi, geoApi } from "./api";
import { customerKeys } from "./keys";
import type { UserFilters } from "./model/filters";
import { hasNextPage, USERS_PAGE_SIZE } from "./model/table";
import type { UserSortBy } from "./model/types";

/** Метрики и карта обновляются раз в 2 минуты (не пресет live: статистика, а не очередь). */
const SLOW_POLL_MS = 120_000;

export interface UsersTableParams {
  q: string;
  filters: UserFilters;
  sortBy: UserSortBy;
  sortDir: SortDir;
}

/** «Показать ещё»: порции по 30 копятся в кэше, смена поиска/фильтра/сортировки начинает с первой. */
export function useUsersTable(p: UsersTableParams) {
  return useInfiniteQuery({
    queryKey: customerKeys.table(p.q, p.filters, p.sortBy, p.sortDir),
    queryFn: ({ pageParam }) =>
      customerApi.users({
        q: p.q || undefined,
        blockedOnly: p.filters.blockedOnly,
        premiumOnly: p.filters.premiumOnly,
        hasOrders: p.filters.hasOrders,
        page: pageParam,
        size: USERS_PAGE_SIZE,
        sortBy: p.sortBy,
        sortDir: p.sortDir,
      }),
    initialPageParam: 0,
    // Сервер не отдаёт общее число: полная порция — значит, дальше, возможно, есть.
    getNextPageParam: (last, all) => (hasNextPage(last.length) ? all.length : undefined),
    placeholderData: keepPreviousData,
  });
}

export function useUserMetrics(range: TimeRange) {
  return useQuery({
    queryKey: customerKeys.metrics(range),
    queryFn: () => customerApi.metrics(range),
    placeholderData: keepPreviousData,
    refetchInterval: SLOW_POLL_MS,
  });
}

/** Все заказы покупателя для профиля; без покупателя запрос выключен. */
export function useUserOrders(telegramUserId: number | undefined) {
  return useQuery({
    queryKey: customerKeys.orders(telegramUserId),
    queryFn: () => customerApi.orders(telegramUserId!),
    enabled: telegramUserId !== undefined,
  });
}

export function useGeoOnline() {
  return useQuery({
    queryKey: customerKeys.geoOnline(),
    queryFn: geoApi.online,
    refetchInterval: QUERY_PRESETS.live.refetchInterval,
    refetchIntervalInBackground: false,
  });
}

export function useGeoOverview(days: number) {
  return useQuery({
    queryKey: customerKeys.geo(days),
    queryFn: () => geoApi.overview(days),
    placeholderData: keepPreviousData,
    refetchInterval: SLOW_POLL_MS,
  });
}

export function useGeoPoint(lat: number, lon: number, days: number) {
  return useQuery({
    queryKey: customerKeys.geoPoint(lat, lon, days),
    queryFn: () => geoApi.point(lat, lon, days),
  });
}
