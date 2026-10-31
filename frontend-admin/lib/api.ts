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

/**
 * Product as the admin API returns it: the shared shape plus the public-site fields
 * (URL slug, struck-through "old" price, SEO overrides) and the catalog v2 card fields
 * (docs/CATALOG-SPECS.md §3.3). Kept here so the Mini App's shared types stay untouched.
 */
export type AdminProduct = Product & {
  slug?: string;
  compareAtMinor?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  /** Article number (unique when set); null = the site uses the id. */
  sku?: string | null;
  /** Card workflow (not shown on the storefront): DRAFT → AI_FILLED → READY. */
  cardStatus?: CardStatus;
  /** Overall AI confidence of the last import, 0..100. */
  cardConfidence?: number | null;
  cardMeta?: CardMeta | null;
  /** Required attribute keys without a value, when the backend computes it (else computed client-side). */
  missingRequired?: string[] | null;
  /** V53: created via the short admin form and not yet published/archived («Незавершён»). */
  unfinished?: boolean;
};

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

/** What the validator dropped on save (unknown key, option not in the list, bad number…). */
export interface SpecIssue {
  key: string;
  reason: string;
}

export type AdminProductSaved = AdminProduct & { specIssues?: SpecIssue[] | null };

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

export interface ProductWriteRequest {
  title: string;
  description?: string;
  priceMinor: number;
  currency: string;
  /** Omitted = keep the stored stock (the admin did not touch it; orders may have moved it). */
  stock?: number;
  /** Stock the form was opened with; a changed `stock` over a moved value -> 409 STOCK_CONFLICT. */
  expectedStock?: number;
  /** Required when `stock` or a variant stock goes DOWN: DEFECT | INVENTORY | MISSORT | SOLD_OFFLINE | OTHER (else 400 STOCK_REASON_REQUIRED). */
  stockReason?: string;
  /** Free text of the write-off; required for OTHER. */
  stockNote?: string;
  active: boolean;
  imageKeys: string[];
  /** Leaf category; required for new products. null = keep, "" = none. */
  categoryId?: string | null;
  /** Existing brand; "" clears, null keeps. Omitted with brandName = find or create by name/alias. */
  brandId?: string | null;
  brandName?: string;
  condition?: ProductCondition;
  /** "" clears. */
  conditionNote?: string;
  /** The whole specs object (keys missing = unknown). */
  specs?: ProductSpecs;
  cardStatus?: CardStatus;
  /**
   * Existing variants MUST carry their id: without it the server can only match by name, and a
   * rename would delete the row and create a new one — which used to invalidate customers'
   * saved carts and the variant reference on past orders.
   */
  variants: { id?: string; name: string; stock?: number; expectedStock?: number }[];
  /** Public site. Blank slug = generate from the title; omitted fields keep their value. */
  slug?: string;
  /** "Старая цена" (minor units); 0 clears it. */
  compareAtMinor?: number;
  seoTitle?: string;
  seoDescription?: string;
  /** Unique among products; "" clears; omitted keeps. A taken one -> 400. */
  sku?: string;
}

export interface PromoCode {
  id: string;
  code: string;
  discountPercent?: number | null;
  discountAmountMinor?: number | null;
  /** Ceiling of the discount in kopecks (V63): «5 %, но не больше 100 ₴»; 0 = без потолка. */
  maxDiscountMinor?: number | null;
  maxUses?: number | null;
  /** How many orders used the code (backend `usesCount`). */
  usesCount?: number | null;
  active: boolean;
}

export interface PaymentOption {
  id?: string;
  title: string;
  description?: string;
  requiresPrepayment: boolean;
  prepaymentMinor?: number | null;
}

// ---- users -----------------------------------------------------------------
export interface UserCardDto {
  telegramUserId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
  premium: boolean;
  botBlocked: boolean;
  ordersCount: number;
  totalSpentMinor: number;
  createdAt?: string | null;
  lastSeenAt?: string | null;
}

export type UserSortBy =
  | "createdAt"
  | "lastSeenAt"
  | "username"
  | "telegramUserId"
  | "ordersCount"
  | "totalSpentMinor";

export interface UserMetricsDto {
  range: TimeRange;
  currency: string;
  totalUsers: number;
  newUsersInRange: number;
  activeUsers: number;
  inactiveUsers: number;
  blockedUsers: number;
  premiumUsers: number;
  newUsersByDay: { date: string; count: number }[];
  languages: { language: string; count: number }[];
  topCustomers: {
    telegramUserId: number;
    name: string;
    ordersCount: number;
    totalSpentMinor: number;
  }[];
}

// ---- broadcasts ------------------------------------------------------------
export type BroadcastAudience = "all" | "active" | "inactive" | "premium";

export interface BroadcastStatus {
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface BroadcastResult {
  ok: boolean;
  detail: string;
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

  // ---- products ----
  products: () => apiGet<AdminProduct[]>("/api/admin/products"),
  productsArchived: () => apiGet<AdminProduct[]>("/api/admin/products/archived"),
  createProduct: (body: ProductWriteRequest) =>
    apiPost<AdminProductSaved>("/api/admin/products", body),
  /** `force`: publish (active=true) a card that is not completed yet (409 CARD_NOT_READY otherwise). */
  updateProduct: (id: string, body: ProductWriteRequest, force = false) =>
    apiPatch<AdminProductSaved>(`/api/admin/products/${id}${force ? "?force=1" : ""}`, body),
  /** «Отметить проверенной» / «Вернуть в черновик». */
  setCardStatus: (id: string, status: CardStatus) =>
    apiPatch<AdminProduct>(`/api/admin/products/${id}/card-status`, { status }),
  /**
   * Turning a DRAFT card on → 409 CARD_NOT_READY (unless `force`); no price / category →
   * 409 PRODUCT_NOT_PUBLISHABLE.
   */
  setProductActive: (id: string, active: boolean, force = false) =>
    apiPatch<AdminProduct>(`/api/admin/products/${id}/active${force ? "?force=1" : ""}`, { active }),
  setProductArchived: (id: string, archived: boolean) =>
    apiPatch<AdminProduct>(`/api/admin/products/${id}/archived`, { archived }),
  upload: (file: File) => uploadFile("/api/admin/uploads", file),

  // ---- promocodes ----
  promocodes: () => apiGet<PromoCode[]>("/api/admin/promocodes"),
  createPromo: (body: Partial<PromoCode>) =>
    apiPost<PromoCode>("/api/admin/promocodes", body),
  updatePromo: (id: string, body: Partial<PromoCode>) =>
    apiPatch<PromoCode>(`/api/admin/promocodes/${id}`, body),
  deletePromo: (id: string) => apiDelete<void>(`/api/admin/promocodes/${id}`),

  // ---- users ----
  /** GET /api/admin/users -> PLAIN UserCardDto[] (not paged). */
  users: (params: {
    q?: string;
    blockedOnly?: boolean;
    page?: number;
    size?: number;
    sortBy?: UserSortBy;
    sortDir?: SortDir;
  }) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.blockedOnly) sp.set("blockedOnly", "true");
    sp.set("page", String(params.page ?? 0));
    sp.set("size", String(params.size ?? 30));
    if (params.sortBy) sp.set("sortBy", params.sortBy);
    if (params.sortDir) sp.set("sortDir", params.sortDir);
    return apiGet<UserCardDto[]>(`/api/admin/users?${sp.toString()}`);
  },
  /** GET /api/admin/users/metrics?range= -> UserMetricsDto. */
  userMetrics: (range: TimeRange = "month") =>
    apiGet<UserMetricsDto>(`/api/admin/users/metrics?range=${range}`),
  /** GET /api/admin/orders/by-user/{tgId} -> all orders of that user (newest first). */
  userOrders: (telegramUserId: number) =>
    apiGet<OrderCardDto[]>(`/api/admin/orders/by-user/${telegramUserId}`),

  // ---- broadcasts ----
  broadcastAudiences: () =>
    apiGet<Record<BroadcastAudience, number>>("/api/admin/broadcast/audiences"),
  broadcastStatus: () => apiGet<BroadcastStatus>("/api/admin/broadcast/status"),
  broadcast: (body: {
    text: string;
    audience: BroadcastAudience;
    withButton?: boolean;
    buttonText?: string;
  }) => apiPost<BroadcastStatus>("/api/admin/broadcast", body),
  broadcastTest: (body: {
    text: string;
    telegramUserId: number;
    withButton?: boolean;
    buttonText?: string;
  }) => apiPost<BroadcastResult>("/api/admin/broadcast/test", body),

  // ---- payment settings ----
  paymentOptions: () => apiGet<PaymentOption[]>("/api/admin/payment-options"),
  putPaymentOptions: (list: PaymentOption[]) =>
    apiPut<PaymentOption[]>("/api/admin/payment-options", list),
};
