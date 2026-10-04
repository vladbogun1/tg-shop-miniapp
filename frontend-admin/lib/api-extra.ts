/**
 * Admin v2 endpoints of the catalog / payment / users / broadcasts / promo / audit screens.
 *
 * Kept next to `api.ts` (same http client) instead of inside it so the parallel admin-v2 packages
 * do not all edit one file. Types here extend the older DTOs with the fields the backend now sends.
 */
import {
  apiGet,
  apiPost,
  apiPut,
  type AuditEntry,
  type BroadcastAudience,
  type BroadcastStatus,
  type PaymentOption,
  type PromoCode,
  type UserCardDto,
} from "./api";

export type ShopLang = "uk" | "ru" | "en";

/** Language names for the admin UI. */
export const LANG_LABEL: Record<ShopLang, string> = { uk: "Украинский", ru: "Русский", en: "Английский" };
export const LANG_SHORT: Record<string, string> = { uk: "UA", ru: "RU", en: "EN" };

// ---- payment ----------------------------------------------------------------
export type PaymentOptionFull = PaymentOption & { sortOrder?: number; active?: boolean };

// ---- users --------------------------------------------------------------------
/** + `locale`: the language chosen in the shop (users.locale), not Telegram's. */
export type UserCard = UserCardDto & { locale?: string | null };

// ---- promo --------------------------------------------------------------------
export type PromoCodeFull = PromoCode & {
  /** Backend name of the counter (the older type reads `usedCount`). */
  usesCount?: number | null;
  /** Live 30-min holds of customers with the code in the cart. */
  reservedCount?: number | null;
};
export interface PromoOrder {
  id: string;
  status: string;
  customerName?: string | null;
  totalMinor: number;
  discountMinor: number;
  createdAt: string;
}

// ---- broadcasts -------------------------------------------------------------------
export interface BroadcastHistoryItem {
  id: number;
  adminName?: string | null;
  text: string;
  textUk?: string | null;
  textRu?: string | null;
  textEn?: string | null;
  audience: BroadcastAudience;
  lang?: ShopLang | null;
  withButton: boolean;
  status: "RUNNING" | "DONE" | "INTERRUPTED";
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  startedAt: string;
  finishedAt?: string | null;
}

export interface BroadcastStart {
  text: string;
  audience: BroadcastAudience;
  withButton: boolean;
  buttonText?: string;
  lang?: ShopLang | "";
  textUk?: string;
  textRu?: string;
  textEn?: string;
}

// ---- audit ------------------------------------------------------------------------
export interface AuditFilter {
  action?: string;
  entityType?: string;
  entityId?: string;
  adminId?: number;
  /** yyyy-MM-dd, shop timezone, inclusive. */
  from?: string;
  to?: string;
}
export interface AuditFacets {
  actions: string[];
  entityTypes: string[];
  admins: { adminId: number; adminName: string }[];
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const extApi = {
  // payment
  /** All options incl. switched-off ones, in checkout order. */
  paymentOptionsAll: () =>
    apiGet<PaymentOptionFull[]>("/api/admin/payment-options?includeInactive=true"),
  putPaymentOptions: (list: PaymentOptionFull[]) =>
    apiPut<PaymentOptionFull[]>("/api/admin/payment-options", list),

  // promo
  promocodes: () => apiGet<PromoCodeFull[]>("/api/admin/promocodes"),
  promoOrders: (id: string) => apiGet<PromoOrder[]>(`/api/admin/promocodes/${id}/orders`),

  // broadcasts
  broadcastAudiences: (lang?: ShopLang | "") =>
    apiGet<Record<BroadcastAudience, number>>(`/api/admin/broadcast/audiences${qs({ lang })}`),
  broadcastHistory: (limit = 20) =>
    apiGet<BroadcastHistoryItem[]>(`/api/admin/broadcast/history?limit=${limit}`),
  broadcast: (body: BroadcastStart) => apiPost<BroadcastStatus>("/api/admin/broadcast", body),
  /** telegramUserId omitted = to the admin who sends it («себе»). */
  broadcastTest: (body: { text: string; telegramUserId?: number; withButton: boolean; buttonText?: string }) =>
    apiPost<{ ok: boolean; detail: string }>("/api/admin/broadcast/test", body),

  // audit
  audit: (filter: AuditFilter, page = 0, size = 50) =>
    apiGet<AuditEntry[]>(`/api/admin/audit${qs({ ...filter, page, size })}`),
  auditFacets: () => apiGet<AuditFacets>("/api/admin/audit/facets"),
};
