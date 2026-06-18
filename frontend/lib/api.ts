/**
 * Typed fetch wrapper + auth.
 *
 * - Sends `Authorization: Bearer <token>` when a token is present.
 * - On boot, exchanges Telegram initData for a JWT via POST /api/auth/telegram
 *   (docs/SPEC.md). Token is kept in memory only (no localStorage in the
 *   skeleton — see design doc §4.1: "v pamyati / sessionStorage").
 * - apiGet / apiPost helpers.
 *
 * Backend may be offline — every call throws a typed ApiError that the UI
 * handles gracefully (TanStack Query error states).
 */

// Origin only — request paths already include the leading "/api/...".
// Defensive: strip a trailing slash AND a trailing "/api" so a base set to
// "http://host:8080/api" doesn't produce "/api/api/...".
const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080")
    .replace(/\/$/, "")
    .replace(/\/api$/, "");

// ---- in-memory token -------------------------------------------------------
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
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
async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    // Network error / backend offline.
    throw new ApiError("Не удалось связаться с сервером", 0);
  }

  if (!res.ok) {
    let msg = `Ошибка ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      msg = data.message ?? data.error ?? msg;
    } catch {
      /* non-json error */
    }
    throw new ApiError(msg, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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

/** Multipart upload (e.g. chat attachment). Does NOT set Content-Type — the
 *  browser sets the multipart boundary itself. Auth header is still attached. */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const headers = new Headers();
  headers.set("Accept", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      body: form,
      headers,
    });
  } catch {
    throw new ApiError("Не удалось связаться с сервером", 0);
  }
  if (!res.ok) {
    let msg = `Ошибка ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string };
      msg = data.message ?? msg;
    } catch {
      /* non-json */
    }
    throw new ApiError(msg, res.status);
  }
  return (await res.json()) as T;
}

/** Origin without /api — for building the WebSocket /ws endpoint. */
export function getApiBase(): string {
  return API_BASE;
}

// ---- auth ------------------------------------------------------------------
export interface AuthResponse {
  accessToken: string;
  user: {
    id: number;
    telegramUserId?: number;
    username?: string;
    firstName?: string;
    lastName?: string;
  };
}

/**
 * Exchange Telegram initData for a JWT and store it in memory.
 * Returns the auth response, or null if no initData (plain browser / dev).
 */
export async function authWithTelegram(
  initDataRaw: string | null
): Promise<AuthResponse | null> {
  if (!initDataRaw) return null;
  const res = await apiPost<AuthResponse>("/api/auth/telegram", {
    initData: initDataRaw,
  });
  setAccessToken(res.accessToken);
  return res;
}

// ---- domain types (v1 contract, docs/SPEC.md) ------------------------------
export interface ProductImage {
  id?: number;
  /** S3 object key under product-images bucket, OR an absolute external url. */
  url?: string;
  sortOrder?: number;
}

export interface ProductTag {
  id: string;
  name: string;
}

export interface ProductVariant {
  id: string;
  name: string;
  stock: number;
  sortOrder?: number;
}

export interface Product {
  /** UUID string (docs/SPEC.md). */
  id: string;
  title: string;
  description?: string;
  /** Tsena v minornyh edinitsah (docs/SPEC.md "Den'gi"). */
  priceMinor: number;
  currency?: string;
  stock?: number;
  active?: boolean;
  soldCount?: number;
  images?: ProductImage[];
  variants?: ProductVariant[];
  tags?: ProductTag[];
}

// ============================================================================
// Phase-2 contract (docs/SPEC.md "Фаза 2 — полный API-контракт")
// ============================================================================

// ---- Orders ----------------------------------------------------------------
export type OrderStatus =
  | "NEW"
  | "APPROVED"
  | "SHIPPED"
  | "DELIVERED"
  | "REJECTED";

export type DeliveryMethod = "NOVA_POSHTA" | "PICKUP";

/** GET /api/me/orders */
export interface OrderSummary {
  id: string;
  status: OrderStatus;
  totalMinor: number;
  currency: string;
  createdAt: string;
  itemsCount: number;
  unreadCount: number;
}

export interface OrderItem {
  id?: string;
  productId: string;
  variantId?: string | null;
  title: string;
  variantName?: string | null;
  quantity: number;
  priceMinor: number;
  currency?: string;
  imageUrl?: string | null;
}

export interface PaymentRequisites {
  cardNumber?: string;
  iban?: string;
  recipient?: string;
  taxId?: string;
  purpose?: string;
}

/** GET /api/me/orders/{id} */
export interface OrderDetail {
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
  items: OrderItem[];
  requisites?: PaymentRequisites | null;
  createdAt: string;
}

// ---- Chat messages ---------------------------------------------------------
export type MessageSenderType = "CUSTOMER" | "ADMIN" | "SYSTEM";
export type MessageType = "TEXT" | "PHOTO" | "FILE" | "SYSTEM";

/** MessageDto (docs/SPEC.md WebSocket). */
export interface Message {
  id: string;
  orderId: string;
  senderType: MessageSenderType;
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

/** A chat conversation row for the notifications inbox. */
export interface Conversation {
  orderId: string;
  shortId: string;
  customerName?: string | null;
  status: OrderStatus;
  lastPreview: string;
  lastSenderType?: MessageSenderType | null;
  lastAt?: string | null;
  unreadCount: number;
}

// ---- Payment ----------------------------------------------------------------
/** GET /api/payment-options */
export interface PaymentOption {
  id: string;
  title: string;
  description?: string;
  requiresPrepayment: boolean;
  prepaymentMinor?: number;
}

// ---- Nova Poshta ------------------------------------------------------------
export interface NpCity {
  ref: string;
  name: string;
  area?: string;
}

export type NpCategory = "POSTOMAT" | "BRANCH" | "POINT" | "OTHER";

export interface NpWarehouse {
  ref: string;
  number?: string | number;
  description: string;
  type?: string;
  category?: NpCategory;
  cityRef?: string | null;
  cityName?: string | null;
  lat?: number | null;
  lng?: number | null;
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

// ---- Create order -----------------------------------------------------------
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
  deliveryMethod: DeliveryMethod;
  npCityRef?: string;
  npCityName?: string;
  npWarehouseRef?: string;
  npWarehouseName?: string;
  paymentOptionId: string;
}

export interface CreateOrderResponse {
  orderId: string;
}

// ---- typed endpoint helpers -------------------------------------------------
export const customerApi = {
  // Public
  getProduct: (id: string) => apiGet<Product>(`/api/products/${id}`),
  getPaymentOptions: () => apiGet<PaymentOption[]>("/api/payment-options"),
  getNpCities: (q: string) =>
    apiGet<NpCity[]>(`/api/np/cities?q=${encodeURIComponent(q)}`),
  getNpWarehouses: (cityRef: string, q: string) =>
    apiGet<NpWarehouse[]>(
      `/api/np/warehouses?cityRef=${encodeURIComponent(cityRef)}&q=${encodeURIComponent(q)}`
    ),
  /** GET /api/np/warehouses/bbox — warehouses inside a map viewport (for the map picker). */
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
    return apiGet<NpWarehouse[]>(`/api/np/warehouses/bbox?${sp.toString()}`);
  },

  // Customer (auth required)
  /** GET /api/me/unread-count -> total unread messages across the user's orders. */
  unreadCount: () => apiGet<{ count: number }>("/api/me/unread-count"),
  /** GET /api/me/conversations -> my orders with unread admin messages. */
  conversations: () => apiGet<Conversation[]>("/api/me/conversations"),
  createOrder: (body: CreateOrderRequest) =>
    apiPost<CreateOrderResponse>("/api/orders", body),
  getOrders: () => apiGet<OrderSummary[]>("/api/me/orders"),
  getOrder: (id: string) => apiGet<OrderDetail>(`/api/me/orders/${id}`),
  getMessages: (id: string) =>
    apiGet<Message[]>(`/api/me/orders/${id}/messages`),
  sendMessage: (id: string, body: SendMessageRequest) =>
    apiPost<Message>(`/api/me/orders/${id}/messages`, body),
  markRead: (id: string) =>
    apiPost<void>(`/api/me/orders/${id}/messages/read`),
  uploadAttachment: (file: File) =>
    apiUpload<{ url: string }>("/api/me/uploads", file),
};
