"use client";

import { QUERY_PRESETS } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { metricsApi } from "./api";
import { analyticsKeys } from "./keys";
import type { Channel, PeriodParams } from "./model/types";

/** Сводка «Сегодня» опрашивается раз в минуту, обзор — раз в 2 минуты (не пресет live: статистика, а не очередь). */
const TODAY_POLL_MS = 60_000;
const OVERVIEW_POLL_MS = 120_000;

/** «Сегодня» над доской заказов: свежесть 30 с (пресет list), опрос раз в минуту. */
export function useTodayMetrics() {
  return useQuery({
    queryKey: analyticsKeys.today(),
    queryFn: () => metricsApi.today(),
    refetchInterval: TODAY_POLL_MS,
    staleTime: QUERY_PRESETS.list.staleTime,
  });
}

export function useOverview(params: PeriodParams) {
  return useQuery({
    queryKey: analyticsKeys.overview(params),
    queryFn: () => metricsApi.overview(params),
    placeholderData: keepPreviousData,
    refetchInterval: OVERVIEW_POLL_MS,
  });
}

export function useForecast(channel: Channel) {
  return useQuery({
    queryKey: analyticsKeys.forecast(channel),
    queryFn: () => metricsApi.forecast(channel),
    staleTime: QUERY_PRESETS.static.staleTime,
  });
}

export function useReturns(params: PeriodParams) {
  return useQuery({
    queryKey: analyticsKeys.returns(params),
    queryFn: () => metricsApi.returns(params),
    placeholderData: keepPreviousData,
  });
}

export function useStock(params: PeriodParams, deadDays: number, coverDays: number) {
  return useQuery({
    queryKey: analyticsKeys.stock(params, deadDays, coverDays),
    queryFn: () => metricsApi.stock(params, deadDays, coverDays),
    placeholderData: keepPreviousData,
  });
}

export function useCustomers(params: PeriodParams) {
  return useQuery({
    queryKey: analyticsKeys.customers(params),
    queryFn: () => metricsApi.customers(params),
    placeholderData: keepPreviousData,
  });
}

export function useFunnel(params: PeriodParams) {
  return useQuery({
    queryKey: analyticsKeys.funnel(params),
    queryFn: () => metricsApi.funnel(params),
    placeholderData: keepPreviousData,
  });
}

export function useOperations(params: PeriodParams) {
  return useQuery({
    queryKey: analyticsKeys.operations(params),
    queryFn: () => metricsApi.operations(params),
    placeholderData: keepPreviousData,
  });
}

export function usePreorderMetrics(from: string, to: string) {
  return useQuery({
    queryKey: analyticsKeys.preorders(from, to),
    queryFn: () => metricsApi.preorders(from, to),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useMarginReport(params: PeriodParams) {
  return useQuery({
    queryKey: analyticsKeys.margin(params),
    queryFn: () => metricsApi.margin(params),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** «Скрыть» товар с витрины из таблицы «Не продаётся»; `onHidden` закрывает вопрос «Скрыть?». */
export function useHideDeadProduct(onHidden: () => void) {
  return useApiMutation({
    mutationFn: (id: string) => metricsApi.hideProduct(id),
    invalidate: [analyticsKeys.stockRoot()],
    success: "Товар скрыт с витрины",
    errorFallback: "Не удалось скрыть товар",
    onSuccess: onHidden,
  });
}
