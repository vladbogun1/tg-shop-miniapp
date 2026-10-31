"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@shop/core/query";
import { activityApi } from "./api";
import { activityKeys } from "./keys";
import { ACTIVITY_PAGE } from "./model/filter";
import type { ActivityFilter } from "./model/types";

/** Список типов событий и кодов ошибок для фильтров меняется редко — минута. */
const FACETS_STALE_MS = 60_000;
/** Сколько последних рассылок показывает вкладка «Рассылки». */
const BROADCASTS_LIMIT = 30;

export function useActivityStats() {
  return useQuery({
    queryKey: activityKeys.stats(),
    queryFn: () => activityApi.stats(24),
    staleTime: QUERY_PRESETS.list.staleTime,
  });
}

export function useActivityFacets() {
  return useQuery({ queryKey: activityKeys.facets(), queryFn: () => activityApi.facets(), staleTime: FACETS_STALE_MS });
}

/** Лента событий постранично (по 50): и общая лента, и получатели одной рассылки (`group` в фильтре). */
export function useActivityFeed(filter: ActivityFilter) {
  return useInfiniteQuery({
    queryKey: activityKeys.list(filter),
    queryFn: ({ pageParam }) => activityApi.list(filter, pageParam, ACTIVITY_PAGE),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.items.length < ACTIVITY_PAGE ? undefined : all.length),
  });
}

export function useBroadcastSummaries() {
  return useQuery({ queryKey: activityKeys.broadcasts(), queryFn: () => activityApi.broadcasts(BROADCASTS_LIMIT) });
}
