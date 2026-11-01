import type { Schemas } from "@shop/core/api/schemas";
import type { SortDir } from "@/lib/sort";

/** Карточка покупателя: пустые поля (имя, username, язык, даты) — null в схеме бэкенда. */
export type UserCardDto = Schemas["UserCardDto"];

export type UserSortBy = "createdAt" | "lastSeenAt" | "username" | "telegramUserId" | "ordersCount" | "totalSpentMinor";

export interface UsersTableQuery {
  q?: string;
  blockedOnly?: boolean;
  page?: number;
  size?: number;
  sortBy?: UserSortBy;
  sortDir?: SortDir;
}

export type UserMetricsDto = Schemas["UserMetricsDto"];

// ---- карта пользователей ----------------------------------------------------
export type GeoChannel = Schemas["PointUser"]["channel"];
export type GeoOnline = Schemas["Online"];
export type GeoPoint = Schemas["Point"];
export type GeoOverview = Schemas["CustomerOverview"];
export type GeoPointUser = Schemas["PointUser"];
export type GeoPointDetails = Schemas["PointDetails"];
