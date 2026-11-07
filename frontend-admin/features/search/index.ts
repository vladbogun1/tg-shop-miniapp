/** Поиск палитры Ctrl+K по заказам, товарам и покупателям (`GET /api/admin/search`). */
export { useAdminSearch } from "./queries";
export { MIN_QUERY, hitGroups, normalizeQuery, type HitGroup, type HitRow } from "./model/hits";
