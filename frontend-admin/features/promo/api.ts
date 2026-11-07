import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/http";
import type { ManualDiscountOrder, PromoBody, PromoCode, PromoOrder, PromoOrigin, PromoPage } from "./model/types";
import type { StateFilter } from "./model/promo";

/** Параметры вкладки с сервера: поиск, состояние и номер страницы (с 0). */
export interface PromoPageFilter {
  origin: PromoOrigin;
  q: string;
  state: StateFilter;
  page: number;
  size: number;
}

function pageQuery(p: PromoPageFilter): string {
  const u = new URLSearchParams({ origin: p.origin, page: String(p.page), size: String(p.size) });
  if (p.q.trim()) u.set("q", p.q.trim());
  if (p.state !== "all") u.set("state", p.state);
  return u.toString();
}

export const promoApi = {
  list: () => apiGet<PromoCode[]>("/api/admin/promocodes"),
  page: (p: PromoPageFilter) => apiGet<PromoPage>(`/api/admin/promocodes/page?${pageQuery(p)}`),
  orders: (id: string) => apiGet<PromoOrder[]>(`/api/admin/promocodes/${id}/orders`),
  manualDiscounts: () => apiGet<ManualDiscountOrder[]>("/api/admin/promocodes/manual-discounts"),
  create: (body: PromoBody) => apiPost<PromoCode>("/api/admin/promocodes", body),
  update: (id: string, body: PromoBody) => apiPatch<PromoCode>(`/api/admin/promocodes/${id}`, body),
  remove: (id: string) => apiDelete<void>(`/api/admin/promocodes/${id}`),
};
