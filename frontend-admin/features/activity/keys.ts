import type { ActivityFilter } from "./model/types";

/** Ключи кэша журнала «Бот и сайт». Значения прежние. */
export const activityKeys = {
  stats: () => ["activity-stats"] as const,
  facets: () => ["activity-facets"] as const,
  /** Страницы ленты (и получателей рассылки) под одним фильтром. */
  list: (filter: ActivityFilter) => ["activity", filter] as const,
  broadcasts: () => ["activity-broadcasts"] as const,
};
