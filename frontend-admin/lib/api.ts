/**
 * Admin API client.
 *
 * The fetch plumbing, error type and the DTOs shared with the customer app live in
 * `@shop/shared`; this file keeps only what is admin-specific — the localStorage-backed token,
 * the admin-only payloads, and the typed endpoint list.
 */
import { markStaffBrowser } from "./staff-mark";
import type { Schemas } from "@shop/core/api/schemas";
import { ApiError } from "@shop/core/errors";
import { createHttpClient, normalizeBaseUrl } from "@shop/core/http";
import { type AdminInvoice, type MonobankStatus, type DeliveryMethod, type Message, type OrderCard, type OrderDetail, type OrderStatus, type Product, type ProductImage, type ProductTag, type ProductVariant, type SendMessageRequest, type SenderType, type TimeRange } from "@shop/core/types";
import { type Receipt } from "@shop/core/receipts";
import { type CardStatus, type ProductCondition, type ProductSpecs, type SpecType, type SpecValue } from "@shop/core/catalog";
import { localStore } from "@shop/core/storage";
import { nowMs } from "@shop/core/time";

export { ApiError };
export type {
  AdminInvoice,
  Receipt,
  DeliveryMethod,
  Message,
  MonobankStatus,
  OrderStatus,
  Product,
  ProductImage,
  ProductTag,
  ProductVariant,
  SendMessageRequest,
  SenderType,
  TimeRange,
  CardStatus,
  ProductCondition,
  ProductSpecs,
  SpecType,
  SpecValue,
};

/** Where an order was placed (backend `orders.source`). */
export type OrderSource = "MINIAPP" | "WEB" | "ADMIN";

/** Names the admin UI already uses for the shared shapes (+ admin-only fields). */
export type OrderCardDto = Schemas["OrderCardDto"];
/** `customerLocale`: uk/ru/en chosen by the customer in the shop (users.locale) — answer in it. */
export type OrderDetailDto = Schemas["OrderDetailDto"];

/** products.card_meta — per-field AI confidence and sources of the last «Карточки» import. */
export interface CardMeta {
  fields?: Record<string, { c?: number | null; src?: string | null }>;
  sources?: string[];
  notes?: string | null;
  model?: string | null;
  importedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

export type MessageDto = Message;

const API_BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:8080");

export const apiOrigin = API_BASE;

/** A signed, server-relative receipt link (`/api/receipts/file?…`) → absolute, on the API origin. */
export function receiptHref(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

// ---- token store (localStorage) --------------------------------------------
const TOKEN_KEY = "tgshop_admin_jwt";
let accessToken: string | null = null;

const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(cb: () => void): () => void {
  unauthorizedListeners.add(cb);
  return () => unauthorizedListeners.delete(cb);
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) markStaffBrowser();
  if (typeof window !== "undefined") {
    if (token) localStore.setItem(TOKEN_KEY, token);
    else localStore.removeItem(TOKEN_KEY);
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    accessToken = localStore.getItem(TOKEN_KEY);
    // Admins already signed in before the staff mark existed get it on their next visit.
    if (accessToken) markStaffBrowser();
  }
  return accessToken;
}

/** «Signed in, but this action / page is not allowed» — a 403 that does not end the session. */
export function isForbidden(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403 && e.code !== "TWO_FACTOR_REQUIRED";
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

function dropSession(): void {
  setAccessToken(null);
  unauthorizedListeners.forEach((cb) => cb());
}

/**
 * «Выйти»: the server revokes THIS token (other devices stay logged in), then the session is
 * dropped locally. Fire-and-forget — leaving must work even when the backend is unreachable.
 */
export function logout(): void {
  const token = getAccessToken();
  if (token) {
    void fetch(`${API_BASE}/api/admin/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      keepalive: true,
    }).catch(() => undefined);
  }
  dropSession();
}

/** «Выйти на всех устройствах»: every token of this admin dies (token_version + 1). */
export async function logoutEverywhere(): Promise<void> {
  await http.post<void>("/api/admin/logout-all");
  dropSession();
}

// ---- quiet token renewal ----------------------------------------------------
// Admin tokens are short-lived (12 h by default). Once the current one is past half its life,
// the next API call triggers one background refresh, so a panel in use never logs out while an
// abandoned one simply expires.

interface TokenTimes {
  iat: number;
  exp: number;
  /** Tokens from before short admin tokens had no id — those are swapped right away. */
  hasId: boolean;
}

function tokenTimes(token: string): TokenTimes | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { iat?: number; exp?: number; jti?: string };
    if (typeof claims.iat !== "number" || typeof claims.exp !== "number") return null;
    return { iat: claims.iat, exp: claims.exp, hasId: !!claims.jti };
  } catch {
    return null;
  }
}

const REFRESH_RETRY_MS = 60_000;
let refreshing = false;
let lastRefreshAttempt = 0;

function maybeRefresh(token: string): void {
  if (refreshing || typeof window === "undefined") return;
  const t = tokenTimes(token);
  if (!t) return;
  const now = nowMs() / 1000;
  if (now >= t.exp) return; // already expired: the request will 401 and show the login screen
  const halfLife = t.iat + (t.exp - t.iat) / 2;
  if (t.hasId && now < halfLife) return;
  if (nowMs() - lastRefreshAttempt < REFRESH_RETRY_MS) return;
  lastRefreshAttempt = nowMs();
  refreshing = true;
  // Plain fetch, not the client: a failed refresh must not log the admin out — the current token
  // is still valid, and the next call after a minute simply tries again.
  fetch(`${API_BASE}/api/admin/token/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  })
    .then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json()) as Schemas["AccessTokenResponse"];
      // Only if nobody logged out / in meanwhile.
      if (body.accessToken && getAccessToken() === token) setAccessToken(body.accessToken);
    })
    .catch(() => undefined)
    .finally(() => {
      refreshing = false;
    });
}

const http = createHttpClient({
  baseUrl: API_BASE,
  // The «trusted device» cookie (HttpOnly, path /api/auth/admin) has to travel with the sign-in
  // calls; prod is same-origin anyway, the e2e/dev split origins need "include".
  credentials: "include",
  // The admin is Russian-only: server errors must not follow the browser language (uk by default).
  getLocale: () => "ru",
  getToken: () => {
    const token = getAccessToken();
    if (token) maybeRefresh(token);
    return token;
  },
  onUnauthorized: (status, code) => {
    // Only «not signed in» ends the session: 401 = no / expired / revoked token (also every device
    // after «Выйти везде» — the backend treats a revoked token as anonymous), 403 TWO_FACTOR_REQUIRED
    // = a half-finished sign-in token. Any other 403 is «signed in, but not allowed» (e.g. the
    // «Админы» section for a non-main admin): the admin stays in, the caller shows the message
    // («Недостаточно прав» — QueryState renders it as an empty state, actions as a toast).
    if (status === 401 || code === "TWO_FACTOR_REQUIRED") dropSession();
  },
});

export const apiGet = http.get;
export const apiPost = http.post;
export const apiPatch = http.patch;
export const apiPut = http.put;
export const apiDelete = http.del;

/** Multipart upload -> { key } (POST /api/admin/uploads). */
export function uploadFile(path: string, file: File): Promise<{ key: string }> {
  return http.upload<{ key: string }>(path, file);
}

// ============================================================================
// Admin-only payloads
// ============================================================================

export interface BoardDto {
  /** Cards per status, capped at 300 per column on the backend. */
  columns: Record<OrderStatus, OrderCardDto[]>;
  /** REAL total per status within the current range+q filter (may exceed columns length). */
  counts: Record<OrderStatus, number>;
}

export type DispatchItem = Schemas["DispatchItem"];

export type DispatchOrder = Schemas["DispatchOrderDto"];

export type OrderSortBy = "createdAt" | "totalMinor" | "customerName" | "status";
export type SortDir = "asc" | "desc";


export interface PaymentOption {
  id?: string;
  title: string;
  description?: string;
  requiresPrepayment: boolean;
  prepaymentMinor?: number | null;
}

// ============================================================================
// Admin API endpoints
// ============================================================================

export const adminApi = {
  // ---- dispatch (seller shipping list) ----
  /** GET /api/admin/orders/dispatch -> approved orders with COD amounts. */
  dispatch: () => apiGet<DispatchOrder[]>("/api/admin/orders/dispatch"),
  /** POST /api/admin/orders/dispatch/broadcast -> post the list to the seller Telegram topic. */
  dispatchBroadcast: () =>
    apiPost<{ posted: number }>("/api/admin/orders/dispatch/broadcast"),

  // ---- orders / board ----
  /** GET /api/admin/orders/board?q=&range= -> { columns } filtered. */
  board: (params: { q?: string; range?: TimeRange } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.range) sp.set("range", params.range);
    const qs = sp.toString();
    return apiGet<BoardDto>(`/api/admin/orders/board${qs ? `?${qs}` : ""}`);
  },
  /** GET /api/admin/orders -> PLAIN OrderCardDto[] (not paged). */
  orders: (params: {
    status?: string;
    q?: string;
    range?: TimeRange;
    page?: number;
    size?: number;
    sortBy?: OrderSortBy;
    sortDir?: SortDir;
  }) => {
    const sp = new URLSearchParams();
    if (params.status) sp.set("status", params.status);
    if (params.q) sp.set("q", params.q);
    if (params.range) sp.set("range", params.range);
    sp.set("page", String(params.page ?? 0));
    sp.set("size", String(params.size ?? 20));
    if (params.sortBy) sp.set("sortBy", params.sortBy);
    if (params.sortDir) sp.set("sortDir", params.sortDir);
    return apiGet<OrderCardDto[]>(`/api/admin/orders?${sp.toString()}`);
  },
  order: (id: string) => apiGet<OrderDetailDto>(`/api/admin/orders/${id}`),
  changeStatus: (
    id: string,
    body: { status: OrderStatus; trackingNumber?: string; rejectReason?: string; restock?: boolean }
  ) => apiPatch<OrderDetailDto>(`/api/admin/orders/${id}/status`, body),
  /**
   * PATCH /api/admin/orders/{id}/paid { receivedMinor } -> updated OrderDetailDto. 0 clears payment.
   * A manual correction (cash on delivery, a mistake); online payments are credited by monobank.
   */
  setPaid: (id: string, receivedMinor: number) =>
    apiPatch<OrderDetailDto>(`/api/admin/orders/${id}/paid`, { receivedMinor }),

  // ---- online payment (monobank) ----
  /** GET /api/admin/orders/{id}/payments -> the order's invoices, newest first. */
  getOrderPayments: (id: string) => apiGet<AdminInvoice[]>(`/api/admin/orders/${id}/payments`),
  /** POST /api/admin/orders/{id}/payments/refresh -> asks monobank for the current state. */
  refreshOrderPayments: (id: string) =>
    apiPost<AdminInvoice[]>(`/api/admin/orders/${id}/payments/refresh`),
  /**
   * POST /api/admin/orders/{id}/payments/{invoiceId}/refund -> money back to the card.
   * `amountMinor` omitted = everything left on that invoice. Settles asynchronously
   * (`refundPending` until monobank confirms).
   */
  refundOrderPayment: (id: string, invoiceId: string, amountMinor?: number) =>
    apiPost<AdminInvoice[]>(
      `/api/admin/orders/${id}/payments/${encodeURIComponent(invoiceId)}/refund`,
      amountMinor === undefined ? {} : { amountMinor }
    ),
  /**
   * GET /api/admin/orders/{id}/receipts -> fiscal checks (sale / return) + the bank receipt of every
   * paid invoice; `downloadUrl` is a signed, server-relative link valid ~10 min (see {@link receiptHref}).
   */
  getOrderReceipts: (id: string) => apiGet<Receipt[]>(`/api/admin/orders/${id}/receipts`),
  /** GET /api/admin/payments/monobank/status -> token configured, merchant, last webhook. */
  getMonobankStatus: () => apiGet<MonobankStatus>("/api/admin/payments/monobank/status"),
  /** Add a product line to the order (paid, or gift when gift=true). */
  addOrderItem: (
    id: string,
    body: { productId: string; variantId?: string; quantity?: number; gift?: boolean; notifyCustomer?: boolean }
  ) => apiPost<OrderDetailDto>(`/api/admin/orders/${id}/items`, body),
  /** Change an order item's quantity (reserves/releases stock). */
  changeOrderItemQty: (
    id: string,
    itemId: number,
    body: { quantity: number; notifyCustomer?: boolean }
  ) => apiPatch<OrderDetailDto>(`/api/admin/orders/${id}/items/${itemId}`, body),
  /** Remove an order item (gift/line), restoring its stock. */
  removeOrderItem: (id: string, itemId: number) =>
    apiDelete<OrderDetailDto>(`/api/admin/orders/${id}/items/${itemId}`),
  /** Apply/update/remove a discount: promo code, or manual amount/percent, or clear. */
  applyOrderDiscount: (
    id: string,
    body: { promoCode?: string; amountMinor?: number; percent?: number; clear?: boolean; notifyCustomer?: boolean }
  ) => apiPost<OrderDetailDto>(`/api/admin/orders/${id}/discount`, body),
  /**
   * Hard delete — DELIVERED / REJECTED only (400 otherwise). A delivered order's stock stays as is
   * (the goods are with the customer) unless `restock: true`; the promo use is released, chat files are removed.
   */
  deleteOrder: (id: string, opts: { restock?: boolean } = {}) =>
    apiDelete<void>(`/api/admin/orders/${id}${opts.restock === true ? "?restock=true" : ""}`),

  /** GET /api/admin/orders/unread-count -> total unread messages across orders. */
  unreadCount: () => apiGet<{ count: number }>("/api/admin/orders/unread-count"),
  /** POST /api/admin/orders/read-all -> mark all customer messages read. */
  markAllRead: () => apiPost<{ marked: number }>("/api/admin/orders/read-all"),

  // ---- order chat ----
  /** A page of chat history, oldest-first; `before` walks further back. */
  messages: (id: string, before?: number) =>
    apiGet<MessageDto[]>(
      `/api/admin/orders/${id}/messages${before ? `?before=${before}` : ""}`
    ),
  sendMessage: (id: string, body: SendMessageRequest) =>
    apiPost<MessageDto>(`/api/admin/orders/${id}/messages`, body),
  markRead: (id: string) =>
    apiPost<void>(`/api/admin/orders/${id}/messages/read`),
  /** Chat attachment (image or PDF) -> { key }: stored privately under chat/, not with product photos. */
  uploadChatAttachment: (id: string, file: File) =>
    uploadFile(`/api/admin/orders/${id}/attachments`, file),

  // ---- payment settings ----
  paymentOptions: () => apiGet<PaymentOption[]>("/api/admin/payment-options"),
  putPaymentOptions: (list: PaymentOption[]) =>
    apiPut<PaymentOption[]>("/api/admin/payment-options", list),
};
