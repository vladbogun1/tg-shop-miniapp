/**
 * Browser API client for the website.
 *
 * Everything goes to the SAME origin (`/api/...`): in production the gateway routes it to the
 * backend, in development `next.config.ts` rewrites it. Authentication is the backend's HttpOnly
 * `access` cookie — this file never sees a token. When a `/api/me/**` call comes back 401/403 the
 * client tries `POST /api/auth/web/refresh` ONCE (the refresh cookie is scoped to /api/auth/web, so
 * only that call carries it) and repeats the request; a second failure means "guest".
 */
import { ApiError } from "@shop/core/errors";
import { createHttpClient, newIdempotencyKey } from "@shop/core/http";
import { type AuthUser, type CreateOrderResult, type Message, type NpCity, type NpWarehouse, type OrderDetail, type OrderLimits, type OrderSummary, type PaymentOption, type PaymentStart, type Product, type PromoPreview, type SendMessageRequest } from "@shop/core/types";
import { type CatalogSchema } from "@shop/core/catalog";
import { type CartLineInput, type ServerCart } from "@shop/core/cart";
import { createCartApi } from "@shop/customer/cart/api";
import { createCheckoutApi } from "@shop/customer/checkout/api";
import { createReviewApi } from "@shop/customer/review/api";
import { type CaseSize, type GiftCaseOpen, type GiftResponse } from "@shop/core/giftcase";
import { getActiveLocale, getActiveTag } from "@shop/core/i18n";
import { type PublicCategory, type PublicProductPage, type StorefrontProduct, type WebLoginStart, type WebLoginStatus, type WebSession } from "@shop/core/site";
import { type Receipt } from "@shop/core/receipts";
import { makeT } from "@/i18n";

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
  /** Every public product, light items (specs included) — the comparison picks its own from it. */
  allCards: () => http.get<PublicProductPage>("/api/public/products?all=1&view=card"),
  catalogSchema: () => http.get<CatalogSchema>("/api/public/catalog/schema"),
  /** Mini App endpoint, unchanged — used to re-validate cart lines by id. */
  productById: (id: string) => http.get<StorefrontProduct | Product>(`/api/products/${id}`),
  /** The gift for the order sum / the gift case (null gift = off). The clients count the progress themselves. */
  gift: () => http.get<GiftResponse>("/api/public/gift"),
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
  // server-side cart (shared with the Mini App; see lib/cart-sync.ts)
  cart: createCartApi(http, authed),
  /** Оформление: промокод, Нова пошта, лимиты, варианты оплаты, создание заказа (@shop/customer/checkout). */
  checkout: createCheckoutApi(http, authed),
  orders: () => authed(() => http.get<OrderSummary[]>("/api/me/orders")),
  order: (id: string) => authed(() => http.get<OrderDetail>(`/api/me/orders/${id}`)),
  messages: (id: string, before?: number) =>
    authed(() =>
      http.get<Message[]>(`/api/me/orders/${id}/messages${before ? `?before=${before}` : ""}`)
    ),
  sendMessage: (id: string, body: SendMessageRequest) =>
    authed(() => http.post<Message>(`/api/me/orders/${id}/messages`, body)),
  /**
   * Opens a monobank invoice for what is due now. `IFRAME`: `pageUrl` is shown inside our payment
   * modal and monobank ends on /pay-return (which tells the modal "done"); `PAGE` (default): a normal
   * page — the new-tab fallback — that sends the customer back to the order page with
   * `?payment=return`. One open invoice per order: starting the other kind closes the previous one.
   * 409 + `code`: PAYMENT_UNAVAILABLE | NOT_PAYABLE | PAYMENT_EXPIRED | PAYMENT_IN_PROGRESS | PAYMENT_FAILED.
   */
  startPayment: (id: string, locale: string, display: "IFRAME" | "PAGE" = "PAGE") =>
    authed(() =>
      http.post<PaymentStart>(
        `/api/me/orders/${id}/payment`,
        display === "IFRAME" ? { returnTo: "SITE", locale, display } : { returnTo: "SITE", locale }
      )
    ),
  /** Asks monobank for the invoice status right now (server-side throttled to 1 per 5 s). */
  refreshPayment: (id: string) =>
    authed(() => http.post<OrderDetail>(`/api/me/orders/${id}/payment/refresh`)),
  /** Fiscal checks + bank receipt of the paid invoices; `downloadUrl` is signed and same-origin. */
  receipts: (id: string) => authed(() => http.get<Receipt[]>(`/api/me/orders/${id}/receipts`)),
  /** Opens (reveals) the gift case of the order; again = the same prize (for «Подивитися ще раз»). */
  openGiftCase: (id: string) => authed(() => http.post<GiftCaseOpen>(`/api/me/orders/${id}/gift-case/open`)),
  swapGiftCase: (id: string) => authed(() => http.post<GiftCaseOpen>(`/api/me/orders/${id}/gift-case/swap`)),
  /** Picks the size of the case prize (a product with sizes) among those in stock. */
  chooseGiftCaseSize: (id: string, variantId: string) =>
    authed(() => http.post<CaseSize>(`/api/me/orders/${id}/gift-case/size`, { variantId })),
  cancelOrder: (id: string, reason?: string) =>
    authed(() => http.post<OrderDetail>(`/api/me/orders/${id}/cancel`, { reason })),
  /** Paid order: ask the shop to cancel it (reason required, ≤ 500). 400 + code on refusal. */
  requestCancel: (id: string, reason: string) =>
    authed(() => http.post<OrderDetail>(`/api/me/orders/${id}/cancel-request`, { reason })),
  markRead: (id: string) => authed(() => http.post<void>(`/api/me/orders/${id}/messages/read`)),
  uploadAttachment: (file: File) =>
    authed(() => http.upload<{ url: string }>("/api/me/uploads", file)),

  /** Отзывы и бонус-коды (V44): лента, ожидающие строки, мои отзывы, отправка (@shop/customer/review). */
  reviews: createReviewApi(http, authed),
};

export type { CreateOrderItem, CreateOrderRequest, NpBboxParams } from "@shop/customer/checkout/api";
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
