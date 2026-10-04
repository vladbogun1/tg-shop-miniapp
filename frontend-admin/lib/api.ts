/**
 * Admin API client.
 *
 * The fetch plumbing, error type and the DTOs shared with the customer app live in
 * `@shop/shared`; this file keeps only what is admin-specific — the localStorage-backed token,
 * the admin-only payloads, and the typed endpoint list.
 */
import {
  ApiError,
  createHttpClient,
  normalizeBaseUrl,
  type Conversation,
  type DeliveryMethod,
  type Message,
  type OrderCard,
  type OrderDetail,
  type OrderStatus,
  type PaymentRequisites,
  type Product,
  type ProductImage,
  type ProductTag,
  type ProductVariant,
  type SendMessageRequest,
  type SenderType,
  type TimeRange,
} from "@shop/shared";

export { ApiError };
export type {
  Conversation,
  DeliveryMethod,
  Message,
  OrderStatus,
  Product,
  ProductImage,
  ProductTag,
  ProductVariant,
  SendMessageRequest,
  SenderType,
  TimeRange,
};

/** Where an order was placed (backend `orders.source`). */
export type OrderSource = "MINIAPP" | "WEB" | "ADMIN";

/** Names the admin UI already uses for the shared shapes (+ admin-only fields). */
export type OrderCardDto = OrderCard & { source?: OrderSource };
/** `customerLocale`: uk/ru/en chosen by the customer in the shop (users.locale) — answer in it. */
export type OrderDetailDto = OrderDetail & { source?: OrderSource; customerLocale?: string | null };

/**
 * Product as the admin API returns it: the shared shape plus the public-site fields
 * (URL slug, struck-through "old" price, SEO overrides). Kept here so the Mini App's shared
 * types stay untouched.
 */
export type AdminProduct = Product & {
  slug?: string;
  compareAtMinor?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

/** Tag = a category on the public site: URL slug, menu position and visibility. */
export type AdminTag = ProductTag & {
  slug?: string;
  sortOrder?: number;
  showInMenu?: boolean;
};

export interface TagWriteRequest {
  name: string;
  /** Blank = generate from the name. */
  slug?: string;
  sortOrder?: number;
  showInMenu?: boolean;
}
export type MessageDto = Message;
export type ConversationDto = Conversation;
export type PaymentRequisitesDto = PaymentRequisites;

const API_BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:8080");

export const apiOrigin = API_BASE;

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
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem(TOKEN_KEY);
  }
  return accessToken;
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
  const now = Date.now() / 1000;
  if (now >= t.exp) return; // already expired: the request will 401 and show the login screen
  const halfLife = t.iat + (t.exp - t.iat) / 2;
  if (t.hasId && now < halfLife) return;
  if (Date.now() - lastRefreshAttempt < REFRESH_RETRY_MS) return;
  lastRefreshAttempt = Date.now();
  refreshing = true;
  // Plain fetch, not the client: a failed refresh must not log the admin out — the current token
  // is still valid, and the next call after a minute simply tries again.
  fetch(`${API_BASE}/api/admin/token/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  })
    .then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json()) as AdminAuthResponse;
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
  getToken: () => {
    const token = getAccessToken();
    if (token) maybeRefresh(token);
    return token;
  },
  onUnauthorized: () => {
    dropSession();
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

// ---- admin auth ------------------------------------------------------------
export interface AdminAuthResponse {
  accessToken: string;
}

/** POST /api/auth/admin/telegram { initData } -> { accessToken }. */
export async function authAdminTelegram(initData: string): Promise<AdminAuthResponse> {
  const res = await http.post<AdminAuthResponse>("/api/auth/admin/telegram", { initData });
  setAccessToken(res.accessToken);
  return res;
}

/** POST /api/auth/admin/login { username, password } -> { accessToken }. */
export async function authAdminLogin(
  username: string,
  password: string
): Promise<AdminAuthResponse> {
  const res = await http.post<AdminAuthResponse>("/api/auth/admin/login", { username, password });
  setAccessToken(res.accessToken);
  return res;
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

export interface DispatchItem {
  title: string;
  variantName?: string | null;
  quantity: number;
  priceMinor: number;
}

/**
 * Seller dispatch row for an APPROVED order: what to ship and how much cash to collect.
 * `paymentClaimed` without `paid` means the customer sent a screenshot nobody has verified —
 * the COD amount stays full until an admin confirms it.
 */
export interface DispatchOrder {
  id: string;
  shortId: string;
  customerName: string;
  phone: string;
  deliveryMethod: DeliveryMethod;
  npCityName?: string | null;
  npWarehouseName?: string | null;
  items: DispatchItem[];
  totalMinor: number;
  prepaymentMinor: number;
  receivedMinor: number;
  codMinor: number;
  paid: boolean;
  paymentClaimed: boolean;
  currency: string;
  paymentOptionTitle?: string | null;
  trackingNumber?: string | null;
  createdAt: string;
  approvedAt?: string | null;
}

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
  active: boolean;
  imageKeys: string[];
  tagIds: string[];
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
}

export interface PromoCode {
  id: string;
  code: string;
  discountPercent?: number | null;
  discountAmountMinor?: number | null;
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

/** Outcome of the public site's on-demand rebuild (GET /api/admin/site/revalidate/status). */
export interface SiteRevalidateStatus {
  /** False when SITE_REVALIDATE_URL is not configured. */
  enabled: boolean;
  lastSuccessAt?: string | null;
  lastErrorAt?: string | null;
  lastError?: string | null;
}

/** One row of the admin action log (GET /api/admin/audit). */
export interface AuditEntry {
  id: number;
  adminId: number;
  adminName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: string | null;
  createdAt: string;
}

// ---- metrics ---------------------------------------------------------------

export interface RevenueByDay {
  date: string; // yyyy-MM-dd
  revenueMinor: number;
  orders: number;
}
export interface OrdersByDay {
  date: string; // yyyy-MM-dd
  count: number;
}
export interface TopProduct {
  title: string;
  qty: number;
  revenueMinor: number;
}
export interface PaymentOptionStat {
  title: string;
  count: number;
}
export interface DeliverySpeed {
  avgApproveHours: number | null;
  avgShipHours: number | null;
  avgDeliverHours: number | null;
  avgTotalHours: number | null;
}

export interface MetricsDto {
  range: TimeRange;
  currency: string;
  totalOrders: number;
  deliveredOrders: number;
  rejectedOrders: number;
  approvedOrders: number;
  shippedOrders: number;
  newOrders: number;
  revenueMinor: number;
  avgOrderValueMinor: number;
  statusCounts: Record<OrderStatus, number>;
  revenueByDay: RevenueByDay[];
  ordersByDay: OrdersByDay[];
  topProducts: TopProduct[];
  deliveryMethods: Record<DeliveryMethod, number>;
  paymentOptions: PaymentOptionStat[];
  deliverySpeed: DeliverySpeed;
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

export interface AdminTarget {
  telegramUserId: number;
  name?: string | null;
  username?: string | null;
}

// ---- content translations (docs/CONTENT-I18N.md) ---------------------------
export type TrLocale = "uk" | "en";
export type TrEntityType = "PRODUCT" | "VARIANT" | "TAG" | "PAYMENT_OPTION" | "PAYMENT_REQUISITES";
export type TrStatus = "TRANSLATED" | "STALE" | "MISSING";
export type TrOrigin = "AI" | "MANUAL";

/** One translatable field of one language (GET /api/admin/translations/export). */
export interface TrExportItem {
  entityType: TrEntityType;
  entityId: string;
  field: string;
  /** Russian source as stored (the source of truth). */
  source: string;
  /** SHA-256 hex of `source` — a translation applies only while this matches. */
  sourceHash: string;
  status: TrStatus;
  /** Current translation (outdated one for STALE), null for MISSING. */
  text: string | null;
  origin: TrOrigin | null;
  /** Owning product of PRODUCT/VARIANT fields; null for tags and payment options. */
  productId: string | null;
  productTitle: string | null;
}

export interface TrImportItem {
  entityType: string;
  entityId: string;
  field: string;
  sourceHash: string;
  text: string;
}

export interface TrRejected {
  entityType: string | null;
  entityId: string | null;
  field: string | null;
  /** INVALID_* | NOT_FOUND | NO_SOURCE | STALE | MANUAL */
  reason: string;
}

export interface TrImportResult {
  applied: number;
  skippedStale: number;
  skippedManual: number;
  notFound: number;
  invalid: number;
  rejected: TrRejected[];
}

export interface TrCounts {
  translated: number;
  stale: number;
  missing: number;
}

/** locale → entity type (+ "ALL") → counts. */
export interface TrStats {
  locales: Record<TrLocale, Record<TrEntityType | "ALL", TrCounts>>;
}

export interface TrSourceFixResult {
  updated: number;
  skippedStale: number;
  notFound: number;
  invalid: number;
  translationsApplied: number;
  sourceHash: string;
  rejected: TrRejected[];
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
  /** GET /api/admin/metrics?range= -> MetricsDto. */
  metrics: (range: TimeRange = "month") =>
    apiGet<MetricsDto>(`/api/admin/metrics?range=${range}`),
  order: (id: string) => apiGet<OrderDetailDto>(`/api/admin/orders/${id}`),
  changeStatus: (
    id: string,
    body: { status: OrderStatus; trackingNumber?: string; rejectReason?: string; restock?: boolean }
  ) => apiPatch<OrderDetailDto>(`/api/admin/orders/${id}/status`, body),
  /** PATCH /api/admin/orders/{id}/paid { paid } -> updated OrderDetailDto. */
  /** PATCH /api/admin/orders/{id}/paid { receivedMinor } -> updated OrderDetailDto. 0 clears payment. */
  setPaid: (id: string, receivedMinor: number) =>
    apiPatch<OrderDetailDto>(`/api/admin/orders/${id}/paid`, { receivedMinor }),
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
   * Hard delete — DELIVERED / REJECTED only (400 otherwise). A delivered order's stock goes back
   * unless `restock: false`; the promo use is released, chat files are removed.
   */
  deleteOrder: (id: string, opts: { restock?: boolean } = {}) =>
    apiDelete<void>(`/api/admin/orders/${id}${opts.restock === false ? "?restock=false" : ""}`),

  /** GET /api/admin/orders/unread-count -> total unread messages across orders. */
  unreadCount: () => apiGet<{ count: number }>("/api/admin/orders/unread-count"),
  /** GET /api/admin/orders/conversations -> orders with unread customer messages. */
  conversations: () => apiGet<ConversationDto[]>("/api/admin/orders/conversations"),
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
    apiPost<AdminProduct>("/api/admin/products", body),
  updateProduct: (id: string, body: ProductWriteRequest) =>
    apiPatch<AdminProduct>(`/api/admin/products/${id}`, body),
  setProductActive: (id: string, active: boolean) =>
    apiPatch<AdminProduct>(`/api/admin/products/${id}/active`, { active }),
  setProductArchived: (id: string, archived: boolean) =>
    apiPatch<AdminProduct>(`/api/admin/products/${id}/archived`, { archived }),
  upload: (file: File) => uploadFile("/api/admin/uploads", file),

  // ---- tags ----
  tags: () => apiGet<AdminTag[]>("/api/admin/tags"),
  createTag: (body: TagWriteRequest) => apiPost<AdminTag>("/api/admin/tags", body),
  updateTag: (id: string, body: TagWriteRequest) =>
    apiPatch<AdminTag>(`/api/admin/tags/${id}`, body),
  deleteTag: (id: string) => apiDelete<void>(`/api/admin/tags/${id}`),

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
  broadcastAdmins: () => apiGet<AdminTarget[]>("/api/admin/broadcast/admins"),
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

  // ---- audit log ----
  /** GET /api/admin/audit -> recent admin actions (newest first). */
  audit: (page = 0, size = 50) =>
    apiGet<AuditEntry[]>(`/api/admin/audit?page=${page}&size=${size}`),

  // ---- content translations ----
  translationsExport: (locale: TrLocale, status: "missing" | "stale" | "translated" | "all" = "all") =>
    apiGet<TrExportItem[]>(`/api/admin/translations/export?locale=${locale}&status=${status}`),
  translationsStats: () => apiGet<TrStats>("/api/admin/translations/stats"),
  translationsImport: (body: {
    locale: TrLocale;
    origin: TrOrigin;
    force?: boolean;
    items: TrImportItem[];
  }) => apiPut<TrImportResult>("/api/admin/translations/import", body),
  /** Reset one field of one language (the Russian original is shown again). */
  translationsReset: (locale: TrLocale, entityType: string, entityId: string, field: string) =>
    apiDelete<{ deleted: number }>(
      `/api/admin/translations?locale=${locale}&entityType=${entityType}&entityId=${entityId}&field=${encodeURIComponent(field)}`
    ),
  /** Proofreading: replace the Russian source (optimistic by sourceHash) + write uk/en of the new text. */
  translationsSourceFix: (body: {
    items: { entityType: string; entityId: string; field: string; sourceHash: string }[];
    source: string;
    translations: Partial<Record<TrLocale, string>>;
  }) => apiPut<TrSourceFixResult>("/api/admin/translations/source-fix", body),

  // ---- public site ----
  /** POST /api/admin/site/revalidate -> rebuild every page now; `error` is null on success. */
  siteRevalidate: () =>
    apiPost<{ ok: boolean; error?: string | null; status: SiteRevalidateStatus }>(
      "/api/admin/site/revalidate"
    ),
  /** Last automatic/manual rebuild outcome. */
  siteRevalidateStatus: () => apiGet<SiteRevalidateStatus>("/api/admin/site/revalidate/status"),

  // ---- payment settings ----
  paymentOptions: () => apiGet<PaymentOption[]>("/api/admin/payment-options"),
  putPaymentOptions: (list: PaymentOption[]) =>
    apiPut<PaymentOption[]>("/api/admin/payment-options", list),
  paymentRequisites: () =>
    apiGet<PaymentRequisitesDto>("/api/admin/payment-requisites"),
  putPaymentRequisites: (body: PaymentRequisitesDto) =>
    apiPut<PaymentRequisitesDto>("/api/admin/payment-requisites", body),
};
