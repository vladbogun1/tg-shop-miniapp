import type { Schemas } from "@shop/core/api/schemas";
import type { SortDir } from "@/lib/sort";

/**
 * Карточка покупателя. Генерация считает все строки обязательными, а бэкенд шлёт `null` у имени, username,
 * языка и дат — тип честный: эти поля необязательные и nullable, как админка всегда их и читала.
 */
type NullableUserField = "username" | "firstName" | "lastName" | "languageCode" | "locale" | "createdAt" | "lastSeenAt";
export type UserCardDto = Omit<Schemas["UserCardDto"], NullableUserField> & { [K in NullableUserField]?: string | null };

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
export type GeoChannel = "MINIAPP" | "WEB";
export type GeoOnline = Schemas["Online"];
export type GeoPoint = Schemas["Point"];
export type GeoOverview = Schemas["CustomerOverview"];
export type GeoPointUser = Omit<Schemas["PointUser"], "user" | "channel"> & { user: UserCardDto; channel: GeoChannel };
export type GeoPointDetails = Omit<Schemas["PointDetails"], "users"> & { users: GeoPointUser[] };
