"use client";

import { QUERY_PRESETS } from "@shop/core/query";
import type { TimeRange } from "@shop/core/types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { SortDir } from "@/lib/api";
import { customerApi, geoApi } from "./api";
import { customerKeys } from "./keys";
import { USERS_PAGE_SIZE } from "./model/table";
import type { UserSortBy } from "./model/types";

/** Метрики и карта обновляются раз в 2 минуты (не пресет live: статистика, а не очередь). */
const SLOW_POLL_MS = 120_000;

export interface UsersTableParams {
  q: string;
  blockedOnly: boolean;
  page: number;
  sortBy: UserSortBy;
  sortDir: SortDir;
}

export function useUsersTable(p: UsersTableParams) {
  return useQuery({
    queryKey: customerKeys.table(p.q, p.blockedOnly, p.page, p.sortBy, p.sortDir),
    queryFn: () =>
      customerApi.users({
        q: p.q || undefined,
        blockedOnly: p.blockedOnly,
        page: p.page,
        size: USERS_PAGE_SIZE,
        sortBy: p.sortBy,
        sortDir: p.sortDir,
      }),
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
