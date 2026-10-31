"use client";

/**
 * Журнал событий сайта. Движок и формы событий — в `@shop/customer/analytics` (те же, что в Mini App);
 * здесь политика сайта: слать в `/api/public/analytics` с cookie `access` (если вошёл), посетителя
 * различать по случайному `anonId` в localStorage (связывает «открыл товар» до входа с «заказал» после),
 * хранить до 50 событий — потолок пачки открытого веба на бэкенде.
 */
import { createAnalytics } from "@shop/customer/analytics/engine";
import {
  addToCartEvent,
  checkoutStartEvent,
  compareEvent,
  giftCaseOpenEvent,
  orderCreatedEvent,
  pageViewEvent,
  productViewEvent,
} from "@shop/customer/analytics/events";
import { nowMs } from "@shop/core/time";

const analytics = createAnalytics({
  keys: { buffer: "mx-analytics-buffer", session: "mx-sid", anon: "mx-aid" },
  maxBuffered: 50,
  request: () => ({ url: "/api/public/analytics", headers: {}, credentials: "include" }),
  fallbackId: () => `v${nowMs().toString(36)}${Math.random().toString(36).slice(2, 12)}`,
  unavailableId: "anon-unavailable",
});

const { track } = analytics;
export const { flush } = analytics;
export const startAnalytics = analytics.start;

export const trackPageView = () => track(...pageViewEvent());
export const trackProductView = (productId: string) => track(...productViewEvent(productId));
export const trackAddToCart = (productId: string, variantId: string | null, qty: number) =>
  track(...addToCartEvent(productId, variantId, qty));
export const trackCompare = (event: "compare_add" | "compare_open", productId?: string, count?: number) =>
  track(...compareEvent(event, productId, count));
export const trackGiftCaseOpen = (orderId: string, rarity: string) => track(...giftCaseOpenEvent(orderId, rarity));
export const trackCheckoutStart = () => track(...checkoutStartEvent());
export function trackOrderCreated(orderId: string) {
  track(...orderCreatedEvent(orderId));
  void flush(true);
}
