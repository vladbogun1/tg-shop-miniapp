import type { TimeRange } from "@shop/core/types";
import type { UserSortBy } from "./model/types";
import type { SortDir } from "@/lib/api";

/** Ключи кэша фичи. */
export const customerKeys = {
  table: (q: string, blockedOnly: boolean, page: number, sortBy: UserSortBy, sortDir: SortDir) =>
    ["users-table", q, blockedOnly, page, sortBy, sortDir] as const,
  metrics: (range: TimeRange) => ["user-metrics", range] as const,
  orders: (telegramUserId: number | undefined) => ["user-orders", telegramUserId] as const,
  geoOnline: () => ["users-geo-online"] as const,
  geo: (days: number) => ["users-geo", days] as const,
  geoPoint: (lat: number, lon: number, days: number) => ["users-geo-point", lat, lon, days] as const,
};
