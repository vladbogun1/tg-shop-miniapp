/**
 * Typed fetch wrapper + admin auth (docs/SPEC.md Фаза 2).
 *
 * - JWT stored in sessionStorage, attached as `Authorization: Bearer <token>`.
 * - On 401/403 the wrapper clears the token and notifies subscribers so the UI
 *   can bounce back to the login screen.
 * - NEXT_PUBLIC_API_BASE_URL is the origin WITHOUT /api; request paths already
 *   include the leading "/api/...".
 */

const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080")
    .replace(/\/$/, "")
    .replace(/\/api$/, "");

export const apiOrigin = API_BASE;

// ---- token store (sessionStorage) -----------------------------------------
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
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    accessToken = sessionStorage.getItem(TOKEN_KEY);
  }
  return accessToken;
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function logout(): void {
  setAccessToken(null);
  unauthorizedListeners.forEach((cb) => cb());
}

// ---- errors ----------------------------------------------------------------
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ---- core fetch ------------------------------------------------------------
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const isFormData = init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Не удалось связаться с сервером", 0);
  }

  if (res.status === 401 || res.status === 403) {
    setAccessToken(null);
    unauthorizedListeners.forEach((cb) => cb());
    throw new ApiError("Сессия истекла, войдите снова", res.status);
  }

  if (!res.ok) {
    let msg = `Ошибка ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      msg = data.message ?? data.error ?? msg;
    } catch {
      /* non-json */
    }
    throw new ApiError(msg, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

/** Multipart upload -> { key } (POST /api/admin/uploads). */
export async function uploadFile(
  path: string,
  file: File
): Promise<{ key: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return request<{ key: string }>(path, { method: "POST", body: fd });
}

// ---- admin auth ------------------------------------------------------------
export interface AdminAuthResponse {
  accessToken: string;
}

/** POST /api/auth/admin/telegram { initData } -> { accessToken }. */
export async function authAdminTelegram(initData: string): Promise<AdminAuthResponse> {
  const res = await apiPost<AdminAuthResponse>("/api/auth/admin/telegram", {
    initData,
  });
  setAccessToken(res.accessToken);
  return res;
}

/** POST /api/auth/admin/login { username, password } -> { accessToken }. */
export async function authAdminLogin(
  username: string,
  password: string
): Promise<AdminAuthResponse> {
  const res = await apiPost<AdminAuthResponse>("/api/auth/admin/login", {
    username,
    password,
  });
  setAccessToken(res.accessToken);
  return res;
}

// ============================================================================
// Domain DTOs (docs/SPEC.md Фаза 2 — field names match EXACTLY)
// ============================================================================

export type OrderStatus =
  | "NEW"
  | "APPROVED"
  | "SHIPPED"
  | "DELIVERED"
  | "REJECTED";

export type DeliveryMethod = "NOVA_POSHTA" | "PICKUP";
export type SenderType = "CUSTOMER" | "ADMIN" | "SYSTEM";
export type MessageType = "TEXT" | "PHOTO" | "FILE" | "SYSTEM";

export interface OrderCardDto {
  id: string;
  customerName: string;
  totalMinor: number;
  currency: string;
  itemsCount: number;
  deliveryMethod: DeliveryMethod;
  paymentOptionTitle: string;
  unreadCount: number;
  createdAt: string;
  status: OrderStatus;
}

export interface BoardDto {
  /** Cards per status, capped at 300 per column on the backend. */
  columns: Record<OrderStatus, OrderCardDto[]>;
  /** REAL total per status within the current range+q filter (may exceed columns length). */
  counts: Record<OrderStatus, number>;
}

export type OrderSortBy = "createdAt" | "totalMinor" | "customerName" | "status";
export type SortDir = "asc" | "desc";

export interface OrderItemDto {
  id?: string;
  productId?: string;
  title: string;
  variantName?: string | null;
  quantity: number;
  priceMinor: number;
  imageUrl?: string | null;
}

export interface PaymentRequisitesDto {
  cardNumber?: string;
  iban?: string;
  recipient?: string;
  edrpou?: string;
  purpose?: string;
  note?: string;
}

export interface OrderDetailDto {
  id: string;
  status: OrderStatus;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  currency: string;
  customerName: string;
  phone: string;
  comment?: string | null;
  promoCode?: string | null;
  deliveryMethod: DeliveryMethod;
  npCityName?: string | null;
  npWarehouseName?: string | null;
  paymentOptionTitle?: string | null;
  trackingNumber?: string | null;
  rejectReason?: string | null;
  items: OrderItemDto[];
  requisites?: PaymentRequisitesDto | null;
  createdAt: string;
  approvedAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  rejectedAt?: string | null;
  // admin-side extra (GET /api/admin/orders/{id} returns + tg user)
  tgUserId?: number | null;
  tgUsername?: string | null;
}

export interface MessageDto {
  id: string;
  orderId: string;
  senderType: SenderType;
  senderName?: string | null;
  type: MessageType;
  text?: string | null;
  attachmentUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  replyToMessageId?: string | null;
  createdAt: string;
  readAt?: string | null;
}

export interface SendMessageRequest {
  text?: string;
  type: MessageType;
  attachmentUrl?: string;
  fileName?: string;
  mimeType?: string;
  replyToMessageId?: string;
}

export interface ProductImage {
  id?: number;
  url?: string;
  sortOrder?: number;
}
export interface ProductTag {
  id: string;
  name: string;
}
export interface ProductVariant {
  id?: string;
  name: string;
  stock: number;
  sortOrder?: number;
}
export interface Product {
  id: string;
  title: string;
  description?: string;
  priceMinor: number;
  currency?: string;
  stock?: number;
  active?: boolean;
  archived?: boolean;
  soldCount?: number;
  images?: ProductImage[];
  variants?: ProductVariant[];
  tags?: ProductTag[];
}

export interface ProductWriteRequest {
  title: string;
  description?: string;
  priceMinor: number;
  currency: string;
  stock: number;
  active: boolean;
  imageKeys: string[];
  tagIds: string[];
  variants: { name: string; stock: number }[];
}

export interface PromoCode {
  id: string;
  code: string;
  discountPercent?: number | null;
  discountAmountMinor?: number | null;
  maxUses?: number | null;
  usedCount?: number | null;
  active: boolean;
}

export interface PaymentOption {
  id?: string;
  title: string;
  description?: string;
  requiresPrepayment: boolean;
  prepaymentMinor?: number | null;
}

export interface Paged<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

// ---- metrics ---------------------------------------------------------------
export type TimeRange = "month" | "halfyear" | "year" | "all";

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

// ---- conversations (notifications inbox) -----------------------------------
export interface ConversationDto {
  orderId: string;
  shortId: string;
  customerName?: string | null;
  status: OrderStatus;
  lastPreview: string;
  lastSenderType?: SenderType | null;
  lastAt?: string | null;
  unreadCount: number;
}

// ============================================================================
// Admin API endpoints
// ============================================================================

export const adminApi = {
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
    body: { status: OrderStatus; trackingNumber?: string; rejectReason?: string }
  ) => apiPatch<OrderDetailDto>(`/api/admin/orders/${id}/status`, body),
  deleteOrder: (id: string) => apiDelete<void>(`/api/admin/orders/${id}`),

  /** GET /api/admin/orders/unread-count -> total unread messages across orders. */
  unreadCount: () => apiGet<{ count: number }>("/api/admin/orders/unread-count"),
  /** GET /api/admin/orders/conversations -> orders with unread customer messages. */
  conversations: () => apiGet<ConversationDto[]>("/api/admin/orders/conversations"),
  /** POST /api/admin/orders/read-all -> mark all customer messages read. */
  markAllRead: () => apiPost<{ marked: number }>("/api/admin/orders/read-all"),

  // ---- order chat ----
  messages: (id: string) => apiGet<MessageDto[]>(`/api/admin/orders/${id}/messages`),
  sendMessage: (id: string, body: SendMessageRequest) =>
    apiPost<MessageDto>(`/api/admin/orders/${id}/messages`, body),
  markRead: (id: string) =>
    apiPost<void>(`/api/admin/orders/${id}/messages/read`),

  // ---- products ----
  products: () => apiGet<Product[]>("/api/admin/products"),
  productsArchived: () => apiGet<Product[]>("/api/admin/products/archived"),
  createProduct: (body: ProductWriteRequest) =>
    apiPost<Product>("/api/admin/products", body),
  updateProduct: (id: string, body: ProductWriteRequest) =>
    apiPatch<Product>(`/api/admin/products/${id}`, body),
  setProductActive: (id: string, active: boolean) =>
    apiPatch<Product>(`/api/admin/products/${id}/active`, { active }),
  setProductArchived: (id: string, archived: boolean) =>
    apiPatch<Product>(`/api/admin/products/${id}/archived`, { archived }),
  upload: (file: File) => uploadFile("/api/admin/uploads", file),

  // ---- tags ----
  tags: () => apiGet<ProductTag[]>("/api/admin/tags"),
  createTag: (name: string) => apiPost<ProductTag>("/api/admin/tags", { name }),
  renameTag: (id: string, name: string) =>
    apiPatch<ProductTag>(`/api/admin/tags/${id}`, { name }),
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

  // ---- payment settings ----
  paymentOptions: () => apiGet<PaymentOption[]>("/api/admin/payment-options"),
  putPaymentOptions: (list: PaymentOption[]) =>
    apiPut<PaymentOption[]>("/api/admin/payment-options", list),
  paymentRequisites: () =>
    apiGet<PaymentRequisitesDto>("/api/admin/payment-requisites"),
  putPaymentRequisites: (body: PaymentRequisitesDto) =>
    apiPut<PaymentRequisitesDto>("/api/admin/payment-requisites", body),
};
