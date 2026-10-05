/**
 * Browser API client for the website.
 *
 * Everything goes to the SAME origin (`/api/...`): in production the gateway routes it to the
 * backend, in development `next.config.ts` rewrites it. Authentication is the backend's HttpOnly
 * `access` cookie — this file never sees a token. When a `/api/me/**` call comes back 401/403 the
 * client tries `POST /api/auth/web/refresh` ONCE (the refresh cookie is scoped to /api/auth/web, so
 * only that call carries it) and repeats the request; a second failure means "guest".
 */
import {
  ApiError,
  createHttpClient,
  type CartLineInput,
  type CreateOrderResult,
  type ServerCart,
  newIdempotencyKey,
  type AuthUser,
  type Message,
  type NpCity,
  type NpWarehouse,
  type OrderDetail,
  type OrderSummary,
  type PaymentOption,
  type PaymentStart,
  type Product,
  type PromoPreview,
  type PublicCategory,
  type PublicProductPage,
  type SendMessageRequest,
  type StorefrontProduct,
  type WebLoginStart,
  type WebLoginStatus,
  type WebSession,
} from "@shop/shared";
import { makeT } from "@/i18n";
import { getActiveLocale, getActiveTag } from "@/i18n/active";

export { ApiError, newIdempotencyKey };

const http = createHttpClient({
  baseUrl: "",
  getToken: () => null,
  credentials: "include",
  getLocale: getActiveTag,
  messages: {
    offline: () => makeT(getActiveLocale())("common.offline"),
    unauthorized: () => makeT(getActiveLocale())("common.sessionExpired"),
    http: (status) => makeT(getActiveLocale())("common.httpError", { status }),
  },
});

// ---- refresh-once ----------------------------------------------------------

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time: parallel 401s share the same attempt (refresh tokens rotate). */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = http
      .post<void>("/api/auth/web/refresh")
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        // Let the next expiry (15 min later) trigger a fresh attempt.
        setTimeout(() => {
          refreshing = null;
        }, 0);
      });
  }
  return refreshing;
}

export function isAuthFailure(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.status === 403);
}

/** Runs an authenticated call; on 401/403 refreshes the session once and retries. */
async function authed<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (!isAuthFailure(e)) throw e;
    // Even a failed refresh is followed by one retry: another tab may have rotated the refresh
    // token a moment ago (the backend answers 401 to the stale one but keeps the session alive).
    await refreshSession();
    return call();
  }
}

/**
 * Last-chance cart write while the page is being hidden or closed: `keepalive` lets the request
 * outlive the page, which a normal fetch (and the debounce timer in front of it) would not. No
 * refresh-and-retry here — there is no page left to retry from.
 */
export function putCartOnUnload(lines: CartLineInput[]): void {
  try {
    void fetch("/api/me/cart", {
      method: "PUT",
      keepalive: true,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Language": getActiveTag(),
      },
      body: JSON.stringify({ lines }),
    }).catch(() => {
      /* nothing to do: the next visit re-reads the server cart */
    });
  } catch {
    /* fetch unavailable */
  }
}

// ---- payloads ----------------------------------------------------------------

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

export interface NpBboxParams {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  category?: "all" | "postomat" | "branch" | "point";
  q?: string;
  limit?: number;
}

export interface CatalogQuery {
  category?: string;
  q?: string;
  inStock?: boolean;
  priceMax?: number;
  sort?: string;
  page?: number;
  size?: number;
}

export function catalogSearchParams(q: CatalogQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.category) sp.set("category", q.category);
  if (q.q) sp.set("q", q.q);
  if (q.inStock) sp.set("inStock", "true");
  if (q.priceMax) sp.set("priceMax", String(q.priceMax));
  if (q.sort && q.sort !== "default") sp.set("sort", q.sort);
  sp.set("page", String(q.page ?? 0));
  sp.set("size", String(q.size ?? 24));
  return sp;
}

// ---- endpoints -------------------------------------------------------------------

export const api = {
  // public catalog
  categories: () => http.get<PublicCategory[]>("/api/public/categories"),
  products: (q: CatalogQuery) =>
    http.get<PublicProductPage>(`/api/public/products?${catalogSearchParams(q).toString()}`),
  /** Mini App endpoint, unchanged — used to re-validate cart lines by id. */
  productById: (id: string) => http.get<StorefrontProduct | Product>(`/api/products/${id}`),
  paymentOptions: () => http.get<PaymentOption[]>("/api/payment-options"),
  previewPromo: (code: string, subtotalMinor: number) =>
    http.get<PromoPreview>(
      `/api/promo-codes/preview?code=${encodeURIComponent(code)}&subtotalMinor=${subtotalMinor}`
    ),
  npCities: (q: string) => http.get<NpCity[]>(`/api/np/cities?q=${encodeURIComponent(q)}`),
  npWarehousesBbox: (p: NpBboxParams) => {
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
  npWarehouses: (cityRef: string, q = "") =>
    http.get<NpWarehouse[]>(
      `/api/np/warehouses?cityRef=${encodeURIComponent(cityRef)}&q=${encodeURIComponent(q)}`
    ),

  // web login
  loginStart: () => http.post<WebLoginStart>("/api/auth/web/start"),
  loginStatus: (loginId: string) =>
    http.get<{ status: WebLoginStatus }>(
      `/api/auth/web/status?loginId=${encodeURIComponent(loginId)}`
    ),
  loginComplete: (loginId: string) =>
    http.post<{ user: AuthUser }>("/api/auth/web/complete", { loginId }),
  devLogin: (telegramUserId: number) =>
    http.post<{ user: AuthUser }>("/api/auth/web/dev-login", { telegramUserId }),
  logout: () => http.post<void>("/api/auth/web/logout"),

  // customer (cookie session)
  unreadCount: () => authed(() => http.get<{ count: number }>("/api/me/unread-count")),
  sessions: () => authed(() => http.get<WebSession[]>("/api/me/sessions")),
  revokeSession: (id: string) => authed(() => http.del<void>(`/api/me/sessions/${id}`)),
  revokeAllSessions: () => authed(() => http.del<void>("/api/me/sessions")),
  setLocale: (locale: string) =>
    authed(() => http.post<void>(`/api/me/locale?locale=${encodeURIComponent(locale)}`)),
  reservePromo: (code: string, subtotalMinor: number) =>
    authed(() =>
      http.post<PromoPreview>(
        `/api/me/promo/reserve?code=${encodeURIComponent(code)}&subtotalMinor=${subtotalMinor}`
      )
    ),
  releasePromo: (code: string) =>
    authed(() => http.del<void>(`/api/me/promo/reserve?code=${encodeURIComponent(code)}`)),
  // server-side cart (shared with the Mini App; see lib/cart-sync.ts)
  cart: () => authed(() => http.get<ServerCart>("/api/me/cart")),
  putCart: (lines: CartLineInput[]) => authed(() => http.put<ServerCart>("/api/me/cart", { lines })),
  mergeCart: (lines: CartLineInput[]) =>
    authed(() => http.post<ServerCart>("/api/me/cart/merge", { lines })),
  createOrder: (body: CreateOrderRequest, idempotencyKey: string) =>
    authed(() =>
      http.post<CreateOrderResult>("/api/orders", body, { "Idempotency-Key": idempotencyKey })
    ),
  orders: () => authed(() => http.get<OrderSummary[]>("/api/me/orders")),
  order: (id: string) => authed(() => http.get<OrderDetail>(`/api/me/orders/${id}`)),
  messages: (id: string, before?: number) =>
    authed(() =>
      http.get<Message[]>(`/api/me/orders/${id}/messages${before ? `?before=${before}` : ""}`)
    ),
  sendMessage: (id: string, body: SendMessageRequest) =>
    authed(() => http.post<Message>(`/api/me/orders/${id}/messages`, body)),
  /**
   * Opens a monobank invoice for what is due now; the browser then goes to `pageUrl`. monobank
   * sends the customer back to the order page with `?payment=return`. 409 + `code`:
   * PAYMENT_UNAVAILABLE | NOT_PAYABLE | PAYMENT_EXPIRED | PAYMENT_IN_PROGRESS | PAYMENT_FAILED.
   */
  startPayment: (id: string, locale: string) =>
    authed(() =>
      http.post<PaymentStart>(`/api/me/orders/${id}/payment`, { returnTo: "SITE", locale })
    ),
  /** Asks monobank for the invoice status right now (server-side throttled to 1 per 5 s). */
  refreshPayment: (id: string) =>
    authed(() => http.post<OrderDetail>(`/api/me/orders/${id}/payment/refresh`)),
  cancelOrder: (id: string, reason?: string) =>
    authed(() => http.post<OrderDetail>(`/api/me/orders/${id}/cancel`, { reason })),
  markRead: (id: string) => authed(() => http.post<void>(`/api/me/orders/${id}/messages/read`)),
  uploadAttachment: (file: File) =>
    authed(() => http.upload<{ url: string }>("/api/me/uploads", file)),
};

export type {
  AuthUser,
  CartLineInput,
  ServerCart,
  Message,
  NpCity,
  NpWarehouse,
  OrderDetail,
  OrderSummary,
  CreateOrderResult,
  PaymentOption,
  PaymentStart,
  PromoPreview,
  PublicCategory,
  PublicProductPage,
  SendMessageRequest,
  StorefrontProduct,
  WebLoginStatus,
  WebSession,
};
