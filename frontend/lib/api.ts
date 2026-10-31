/**
 * Customer API client.
 *
 * The fetch plumbing, error type and DTOs live in `@shop/shared` — this file is the
 * customer-specific part: where the token is kept (in memory, re-obtained from Telegram initData
 * on every launch) and the typed endpoint list.
 */
import { ApiError } from "@shop/core/errors";
import { createHttpClient, newIdempotencyKey, normalizeBaseUrl } from "@shop/core/http";
import { type AuthResponse, type Conversation, type CreateOrderResult, type Message, type NpCity, type NpWarehouse, type OrderDetail, type OrderLimits, type OrderSummary, type PaymentOption, type PaymentStart, type PromoPreview, type SendMessageRequest } from "@shop/core/types";
import { type CartLineInput, type ServerCart } from "@shop/core/cart";
import { createCartApi } from "@shop/customer/cart/api";
import { createCheckoutApi } from "@shop/customer/checkout/api";
import { createGiftApi } from "@shop/customer/gift/api";
import { createOrderApi, noAuthRetry } from "@shop/customer/order/api";
import { type CatalogSchema } from "@shop/core/catalog";
import { getActiveLocale, getActiveTag } from "@shop/core/i18n";
import { type Receipt } from "@shop/core/receipts";
import { en } from "@/i18n/en";
import { ru } from "@/i18n/ru";
import type { Product } from "@shop/customer/catalog/model/product";
import { uk } from "@/i18n/uk";

export { ApiError, newIdempotencyKey };
export type {
  AuthResponse,
  CartLineInput,
  CatalogSchema,
  Conversation,
  CreateOrderResult,
  Message,
  NpCity,
  NpWarehouse,
  OrderDetail,
  OrderLimits,
  OrderSummary,
  PaymentOption,
  PaymentStart,
  PromoPreview,
  SendMessageRequest,
  ServerCart,
};
export type { CreateOrderItem, CreateOrderRequest, NpBboxParams } from "@shop/customer/checkout/api";
export type { DeliveryMethod, NpCategory, OrderStatus } from "@shop/core/types";
export type { Product, ProductImage, ProductTag, ProductVariant } from "@shop/customer/catalog/model/product";

const API_BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:8080");

/**
 * A phrase from the active dictionary, read outside React.
 *
 * The HTTP client is built once at module load and cannot use a hook, but it must still speak the
 * language currently on screen — so it reads the same module state the formatters use.
 */
function text(key: string): string {
  const dict: Record<string, unknown> = { ru, uk, en }[getActiveLocale()];
  const phrase = dict[key];
  return typeof phrase === "string" ? phrase : key;
}

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
  // Every request carries the language on screen, so the server answers in it — including the
  // public ones. The promo check in the cart runs before sign-in, and that is exactly where a
  // Ukrainian customer was being told "Промокод не найден".
  getLocale: getActiveTag,
  // The client's own wording (no signal / expired session) follows the language too.
  messages: {
    offline: () => text("common.offline"),
    unauthorized: () => text("common.sessionExpired"),
    http: (status) => text("common.httpError").replace("{status}", String(status)),
  },
});

export const apiGet = http.get;
export const apiPost = http.post;
export const apiDel = http.del;
export const apiUpload = http.upload;

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

/**
 * Last-chance cart write while the Mini App is being hidden/closed: `keepalive` lets the request
 * outlive the page. Fire and forget.
 */
export function putCartOnUnload(lines: CartLineInput[]): void {
  const token = getAccessToken();
  if (!token) return;
  try {
    void fetch(`${API_BASE}/api/me/cart`, {
      method: "PUT",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Accept-Language": getActiveTag(),
      },
      body: JSON.stringify({ lines }),
    }).catch(() => {
      /* the next launch re-reads the server cart */
    });
  } catch {
    /* fetch unavailable */
  }
}

// ---- request payloads -------------------------------------------------------

/** GET /api/app-info — public, no sign-in needed (the payment return page uses it). */
export interface AppInfo {
  botUsername?: string | null;
  webappBaseUrl?: string | null;
  imageBaseUrl?: string | null;
}

// ---- typed endpoints --------------------------------------------------------

/** Заказы, оплата, чеки, чат заказа (@shop/customer/order). Токен в памяти — «обновить сессию и повторить» не нужно. */
const orders = createOrderApi(http, noAuthRetry, { returnTo: "MINIAPP" });

export const customerApi = {
  // Public
  getProducts: () => http.get<Product[]>("/api/products"),
  getProduct: (id: string) => http.get<Product>(`/api/products/${id}`),
  /** Catalog v2: category tree, brands, spec attributes — localized by the language header. */
  getCatalogSchema: () => http.get<CatalogSchema>("/api/catalog/schema"),

  // Customer (auth required)
  /**
   * Remembers which language this customer reads, so the bot writes to them in it. The app itself
   * does not need the answer — it already knows — so a failure here is deliberately ignored.
   */
  setLocale: (locale: string) =>
    http.post<void>(`/api/me/locale?locale=${encodeURIComponent(locale)}`),
  unreadCount: () => http.get<{ count: number }>("/api/me/unread-count"),
  /** Server cart shared with the website (same Telegram account) — see lib/cart-sync. */
  cart: createCartApi(http),
  /** Оформление: промокод, Нова пошта, лимиты, варианты оплаты, создание заказа (@shop/customer/checkout). */
  checkout: createCheckoutApi(http),
  /** Подарок за сумму и кейс: публичный подарок, открытие/замена/размер (@shop/customer/gift). */
  gift: createGiftApi(http),
  getAppInfo: () => http.get<AppInfo>("/api/app-info"),
  conversations: () => http.get<Conversation[]>("/api/me/conversations"),
  getOrders: () => orders.list(),
  getOrder: (id: string) => orders.get(id),
  /** A page of chat history, oldest-first; without `before` the newest page. */
  getMessages: (id: string, before?: number) => orders.messages(id, before),
  sendMessage: (id: string, body: SendMessageRequest) => orders.sendMessage(id, body),
  /**
   * A monobank payment page for what is due now (see OrderApi.startPayment). After paying, monobank sends
   * the browser to the Mini App's /pay-return page. `display: "IFRAME"` is no longer used by the Mini App
   * (it pays in the browser).
   */
  startPayment: (id: string, locale: string, display?: "IFRAME") => orders.startPayment(id, locale, display),
  /** Asks monobank for the status right now (server-throttled to once per 5 s) → the order. */
  refreshPayment: (id: string) => orders.refreshPayment(id),
  /** Fiscal checks + bank receipt of the paid invoices; `downloadUrl` is signed and server-relative. */
  getReceipts: (id: string) => orders.receipts(id),
  cancelOrder: (id: string, reason?: string) => orders.cancel(id, reason),
  /** Paid order: ask the shop to cancel it (reason required, ≤ 500). 400 + code on refusal. */
  requestCancel: (id: string, reason: string) => orders.requestCancel(id, reason),
  markRead: (id: string) => orders.markRead(id),
  uploadAttachment: (file: File) => orders.uploadAttachment(file),
};
