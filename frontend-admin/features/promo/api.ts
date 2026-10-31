import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/http";
import type { ManualDiscountOrder, PromoBody, PromoCode, PromoOrder } from "./model/types";

export const promoApi = {
  list: () => apiGet<PromoCode[]>("/api/admin/promocodes"),
  orders: (id: string) => apiGet<PromoOrder[]>(`/api/admin/promocodes/${id}/orders`),
  manualDiscounts: () => apiGet<ManualDiscountOrder[]>("/api/admin/promocodes/manual-discounts"),
  create: (body: PromoBody) => apiPost<PromoCode>("/api/admin/promocodes", body),
  update: (id: string, body: PromoBody) => apiPatch<PromoCode>(`/api/admin/promocodes/${id}`, body),
  remove: (id: string) => apiDelete<void>(`/api/admin/promocodes/${id}`),
};
