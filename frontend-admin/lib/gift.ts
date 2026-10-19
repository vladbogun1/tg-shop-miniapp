/**
 * «Подарок за сумму / кейс» — admin API client (page /gift).
 * Terms (switch, threshold, gift product, case mode) are ordinary settings of the `gift` group
 * (lib/settings.ts); the case prizes and the stats have their own endpoints under /api/admin/gift.
 */
import type { CaseRarity } from "@shop/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

export const GIFT_GROUP = "gift";

/** Last 30 days. */
export interface GiftStats {
  since: string;
  orders: number;
  giftOrders: number;
  /** Orders whose gift was a case and how many of them the customer already opened. */
  caseOrders: number;
  casesOpened: number;
}

/** A prize of the gift case. */
export interface CaseItemAdmin {
  id: number;
  productId: string;
  title: string;
  imageUrl: string | null;
  priceMinor: number;
  stock: number;
  productActive: boolean;
  rarity: CaseRarity;
  weight: number;
  /** Chance among the active prizes in stock, % (0 when this one can't drop). */
  chancePercent: number;
  sortOrder: number;
  active: boolean;
}

/** Russian names of the case rarities (admin is Russian-only). */
export const CASE_RARITY_LABEL: Record<CaseRarity, string> = {
  COMMON: "Обычный",
  RARE: "Редкий",
  EPIC: "Эпический",
  LEGENDARY: "Легендарный",
  GOLD: "Золотой",
};

export type CaseItemPatch = { rarity?: CaseRarity; weight?: number; sortOrder?: number; active?: boolean };

export const giftApi = {
  caseItems: () => apiGet<CaseItemAdmin[]>("/api/admin/gift/case-items"),
  createCaseItem: (body: { productId: string } & CaseItemPatch) => apiPost<CaseItemAdmin>("/api/admin/gift/case-items", body),
  patchCaseItem: (id: number, body: CaseItemPatch) => apiPatch<CaseItemAdmin>(`/api/admin/gift/case-items/${id}`, body),
  deleteCaseItem: (id: number) => apiDelete<void>(`/api/admin/gift/case-items/${id}`),
  stats: () => apiGet<GiftStats>("/api/admin/gift/stats"),
};
