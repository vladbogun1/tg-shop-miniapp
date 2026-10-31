/** «Журнал → Бот и сайт»: GET /api/admin/activity (+ /facets, /stats, /broadcasts), activity_log (V47). */
import { apiGet } from "@/lib/http";
import type { ActivityFacets, ActivityFilter, ActivityPage, ActivityStats, BroadcastSummary } from "./model/types";

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const activityApi = {
  list: (filter: ActivityFilter, page = 0, size = 50) =>
    apiGet<ActivityPage>(`/api/admin/activity${qs({ ...filter, page, size })}`),
  facets: () => apiGet<ActivityFacets>("/api/admin/activity/facets"),
  stats: (hours = 24) => apiGet<ActivityStats>(`/api/admin/activity/stats?hours=${hours}`),
  broadcasts: (limit = 20) => apiGet<BroadcastSummary[]>(`/api/admin/activity/broadcasts?limit=${limit}`),
};
