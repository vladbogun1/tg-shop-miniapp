"use client";

/**
 * Журнал действий Mini App. Движок и формы событий — в `@shop/customer/analytics`; здесь только
 * политика Mini App: слать в `/api/me/analytics` с токеном покупателя (до токена события копятся),
 * хранить до 200 событий, к ошибкам добавлять платформу и версию Telegram.
 */
import { createAnalytics } from "@shop/customer/analytics/engine";
import {
  addToCartEvent,
  checkoutStartEvent,
  giftCaseOpenEvent,
  orderCreatedEvent,
  productViewEvent,
} from "@shop/customer/analytics/events";
import { getAccessToken, getApiBase } from "@/lib/api";
import { nowMs } from "@shop/core/time";

/** Telegram-клиент, в котором открыт Mini App (ios / android / tdesktop… и версия Bot API). */
function telegramRuntime(): Record<string, unknown> {
  try {
    const wa = (window as { Telegram?: { WebApp?: { platform?: string; version?: string } } }).Telegram?.WebApp;
    return { tg: wa?.platform, tgv: wa?.version };
  } catch {
    return {};
  }
}

const analytics = createAnalytics({
  keys: { buffer: "analytics-buffer", session: "analytics-session" },
  // Потолок пачки на бэкенде; сверх него старые события отбрасываются.
  maxBuffered: 200,
  request: () => {
    const token = getAccessToken();
    if (!token) return null; // некому приписать события
    return { url: `${getApiBase()}/api/me/analytics`, headers: { Authorization: `Bearer ${token}` } };
  },
  fallbackId: () => `s${nowMs()}${Math.random().toString(16).slice(2)}`,
  unavailableId: "no-session",
  errorRuntime: telegramRuntime,
});

export const { track, flush } = analytics;
export const startAnalytics = analytics.start;

export const trackProductView = (productId: string) => track(...productViewEvent(productId));
export const trackAddToCart = (productId: string, variantId: string | null, qty: number) =>
  track(...addToCartEvent(productId, variantId, qty));
export const trackGiftCaseOpen = (orderId: string, rarity: string) => track(...giftCaseOpenEvent(orderId, rarity));
export const trackCheckoutStart = () => track(...checkoutStartEvent());
export function trackOrderCreated(orderId: string) {
  track(...orderCreatedEvent(orderId));
  void flush(true);
}
