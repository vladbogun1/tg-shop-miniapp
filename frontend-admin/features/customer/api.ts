import type { Schemas } from "@shop/core/api/schemas";
import { apiDelete, apiGet, apiPut } from "@/lib/http";
import type {
  GeoOnline,
  GeoOverview,
  GeoPointDetails,
  UserCardDto,
  UserMetricsDto,
  UsersTableQuery,
} from "./model/types";
import type { TimeRange } from "@shop/core/types";

export type { GeoOnline, GeoOverview, GeoPointDetails, UserCardDto, UserMetricsDto };
export type CustomerOrderCard = Schemas["OrderCardDto"];
export type CustomerFlag = Schemas["Flag"];

export const customerApi = {
  /** Карточка покупателя по Telegram id (поиск по id, точное совпадение); null — не нашли. */
  findUser: async (telegramUserId: number): Promise<UserCardDto | null> => {
    const rows = await customerApi.users({ q: String(telegramUserId), size: 10 });
    return rows.find((u) => u.telegramUserId === telegramUserId) ?? null;
  },
  /** GET /api/admin/users -> PLAIN UserCardDto[] (not paged). */
  users: (params: UsersTableQuery) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.blockedOnly) sp.set("blockedOnly", "true");
    if (params.premiumOnly) sp.set("premiumOnly", "true");
    if (params.flaggedOnly) sp.set("flaggedOnly", "true");
    if (params.hasOrders !== undefined) sp.set("hasOrders", String(params.hasOrders));
    sp.set("page", String(params.page ?? 0));
    sp.set("size", String(params.size ?? 30));
    if (params.sortBy) sp.set("sortBy", params.sortBy);
    if (params.sortDir) sp.set("sortDir", params.sortDir);
    return apiGet<UserCardDto[]>(`/api/admin/users?${sp.toString()}`);
  },
  /** GET /api/admin/users/metrics?range= -> UserMetricsDto. */
  metrics: (range: TimeRange = "month") => apiGet<UserMetricsDto>(`/api/admin/users/metrics?range=${range}`),
  /** GET /api/admin/orders/by-user/{tgId} -> all orders of that user (newest first). */
  orders: (telegramUserId: number) => apiGet<CustomerOrderCard[]>(`/api/admin/orders/by-user/${telegramUserId}`),
  /** PUT /api/admin/users/{tgId}/flag — пометить «проблемным» или сменить причину (только полная оплата онлайн). */
  flag: (telegramUserId: number, reason: string) =>
    apiPut<CustomerFlag>(`/api/admin/users/${telegramUserId}/flag`, { reason }),
  /** DELETE /api/admin/users/{tgId}/flag — снять метку. */
  unflag: (telegramUserId: number) => apiDelete<void>(`/api/admin/users/${telegramUserId}/flag`),
};

/** Users map API (GET /api/admin/users/geo*): visitors' last IP → city and "online now" from the event journal. */
export const geoApi = {
  overview: (days: number) => apiGet<GeoOverview>(`/api/admin/users/geo?days=${days}`),
  online: () => apiGet<GeoOnline>("/api/admin/users/geo/online"),
  point: (lat: number, lon: number, days: number) =>
    apiGet<GeoPointDetails>(`/api/admin/users/geo/point?lat=${lat}&lon=${lon}&days=${days}`),
};
