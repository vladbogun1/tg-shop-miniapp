/**
 * Customer API client.
 *
 * The fetch plumbing, error type and DTOs live in `@shop/shared` — this file is the
 * customer-specific part: where the token is kept (in memory, re-obtained from Telegram initData
 * on every launch) and the typed endpoint list.
 */
import {
  ApiError,
  createHttpClient,
  newIdempotencyKey,
  normalizeBaseUrl,
  type AuthResponse,
  type Conversation,
  type Message,
  type NpCity,
  type NpWarehouse,
  type OrderDetail,
  type OrderSummary,
  type PaymentOption,
  type PaymentRequisites,
  type Product,
  type PromoPreview,
  type SendMessageRequest,
} from "@shop/shared";

export { ApiError, newIdempotencyKey };
export type {
  AuthResponse,
  Conversation,
  Message,
  NpCity,
  NpWarehouse,
  OrderDetail,
  OrderSummary,
  PaymentOption,
  PaymentRequisites,
  Product,
  PromoPreview,
  SendMessageRequest,
};
export type {
  DeliveryMethod,
  MessageType,
  NpCategory,
  OrderItem,
  OrderStatus,
  ProductImage,
  ProductTag,
  ProductVariant,
  SenderType as MessageSenderType,
} from "@shop/shared";

const API_BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:8080");

// ---- in-memory token -------------------------------------------------------
// Deliberately not localStorage: inside Telegram the Mini App can always re-authenticate from
// initData, so there is no reason to persist a bearer token where a script could read it.
let accessToken: string | null = null;

/** Notified when the token appears, so e.g. a pending WebSocket can connect. */
const tokenListeners = new Set<(token: string | null) => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
  tokenListeners.forEach((cb) => cb(token));
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Subscribe to token changes; returns an unsubscribe function. */
export function onAccessToken(cb: (token: string | null) => void): () => void {
  tokenListeners.add(cb);
  return () => tokenListeners.delete(cb);
}


/** Origin without /api — for building the WebSocket endpoint and absolute media links. */
export function getApiBase(): string {
  return API_BASE;
}

const http = createHttpClient({
  baseUrl: API_BASE,
  getToken: getAccessToken,
});

export const apiGet = http.get;
export const apiPost = http.post;

/** Makes a server-relative signed media link absolute. */
export function mediaUrl(path: string | null | undefined): string | null {
  return http.absolute(path);
}

// ---- auth ------------------------------------------------------------------

/**
 * Exchange Telegram initData for a JWT and keep it in memory.
 * Returns null when there is no initData (plain browser / dev).
 */
export async function authWithTelegram(
  initDataRaw: string | null
): Promise<AuthResponse | null> {
  if (!initDataRaw) return null;
  const res = await http.post<AuthResponse>("/api/auth/telegram", { initData: initDataRaw });
  setAccessToken(res.accessToken);
  return res;
}

// ---- request payloads -------------------------------------------------------

export interface CreateOrderItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface CreateOrderRequest {
  items: CreateOrderItem[];
  customerName: string;
  phone: string;
  comment?: string;
  promoCode?: string;
  deliveryMethod: "NOVA_POSHTA" | "PICKUP";
  npCityRef?: string;
  npCityName?: string;
  npWarehouseRef?: string;
  npWarehouseName?: string;
  paymentOptionId: string;
}

export interface CreateOrderResponse {
  orderId: string;
  requisites?: PaymentRequisites | null;
}

export interface NpBboxParams {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  category?: "all" | "postomat" | "branch" | "point";
  q?: string;
  limit?: number;
}

// ---- typed endpoints --------------------------------------------------------

export const customerApi = {
  // Public
  getProducts: () => http.get<Product[]>("/api/products"),
  getProduct: (id: string) => http.get<Product>(`/api/products/${id}`),
  getPaymentOptions: () => http.get<PaymentOption[]>("/api/payment-options"),
  /** What a promo code is worth for this cart — read-only, does not consume a use. */
  previewPromo: (code: string, subtotalMinor: number) =>
    http.get<PromoPreview>(
      `/api/promo-codes/preview?code=${encodeURIComponent(code)}&subtotalMinor=${subtotalMinor}`
    ),
  getNpCities: (q: string) => http.get<NpCity[]>(`/api/np/cities?q=${encodeURIComponent(q)}`),
  getNpWarehouses: (cityRef: string, q: string) =>
    http.get<NpWarehouse[]>(
      `/api/np/warehouses?cityRef=${encodeURIComponent(cityRef)}&q=${encodeURIComponent(q)}`
    ),
  getNpWarehousesBbox: (p: NpBboxParams) => {
    const sp = new URLSearchParams({
      minLat: String(p.minLat),
      maxLat: String(p.maxLat),
      minLng: String(p.minLng),
      maxLng: String(p.maxLng),
      category: p.category ?? "all",
      limit: String(p.limit ?? 1200),
    });
    if (p.q) sp.set("q", p.q);
    return http.get<NpWarehouse[]>(`/api/np/warehouses/bbox?${sp.toString()}`);
  },

  // Customer (auth required)
  /**
   * Validates the code AND holds a limited one for this customer for half an hour, so the discount
   * the cart shows is still there at the last step. Falls back to the public preview when the
   * Telegram sign-in has not finished yet.
   */
  reservePromo: (code: string, subtotalMinor: number) =>
    http.post<PromoPreview>(
      `/api/me/promo/reserve?code=${encodeURIComponent(code)}&subtotalMinor=${subtotalMinor}`
    ),
  /** Gives a held code back when the customer clears or replaces it. */
  releasePromo: (code: string) =>
    http.del<void>(`/api/me/promo/reserve?code=${encodeURIComponent(code)}`),
  /**
   * Remembers which language this customer reads, so the bot writes to them in it. The app itself
   * does not need the answer — it already knows — so a failure here is deliberately ignored.
   */
  setLocale: (locale: string) =>
    http.post<void>(`/api/me/locale?locale=${encodeURIComponent(locale)}`),
  /** Buffered interaction journal, flushed in batches — see lib/analytics. */
  sendAnalytics: (batch: { sessionId: string; events: unknown[] }) =>
    http.post<void>("/api/me/analytics", batch),
  unreadCount: () => http.get<{ count: number }>("/api/me/unread-count"),
  conversations: () => http.get<Conversation[]>("/api/me/conversations"),
  /**
   * Places an order. The idempotency key makes a retry (lost response, double tap) return the
   * order already created instead of placing a second one with a second stock deduction.
   */
  createOrder: (body: CreateOrderRequest, idempotencyKey: string) =>
    http.post<CreateOrderResponse>("/api/orders", body, { "Idempotency-Key": idempotencyKey }),
  getOrders: () => http.get<OrderSummary[]>("/api/me/orders"),
  getOrder: (id: string) => http.get<OrderDetail>(`/api/me/orders/${id}`),
  /**
   * A page of chat history, oldest-first. Without `before` it returns the newest page —
   * the whole thread used to be fetched on every open.
   */
  getMessages: (id: string, before?: number) =>
    http.get<Message[]>(
      `/api/me/orders/${id}/messages${before ? `?before=${before}` : ""}`
    ),
  sendMessage: (id: string, body: SendMessageRequest) =>
    http.post<Message>(`/api/me/orders/${id}/messages`, body),
  /**
   * Submits a transfer screenshot. This only RECORDS A CLAIM: the order is not marked paid and the
   * cash-on-delivery amount does not change until an admin confirms the money actually arrived.
   */
  submitPaymentProof: (id: string, body: SendMessageRequest) =>
    http.post<OrderDetail>(`/api/me/orders/${id}/pay`, body),
  cancelOrder: (id: string, reason?: string) =>
    http.post<OrderDetail>(`/api/me/orders/${id}/cancel`, { reason }),
  markRead: (id: string) => http.post<void>(`/api/me/orders/${id}/messages/read`),
  uploadAttachment: (file: File) => http.upload<{ url: string }>("/api/me/uploads", file),
};
