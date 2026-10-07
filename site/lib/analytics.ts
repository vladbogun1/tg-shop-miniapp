"use client";

/**
 * Website event journal — the same structured events as the Mini App (frontend/lib/analytics.ts),
 * sent to POST /api/public/analytics with channel WEB on the server side.
 *
 * Most site visitors never sign in, so a visitor is identified by a random id kept in localStorage
 * (`anonId`): it ties "opened a product" before login to "placed an order" after it. When the
 * `access` cookie is there, the backend also records the Telegram id. Sent: page views, product
 * views, adds to cart, checkout start, order created, and clicks — the label of what was tapped plus
 * the element actually under the finger (same as the Mini App, shared/src/tap.ts). No field values,
 * nothing personal.
 *
 * Nothing here may break a page: every path is wrapped, failures are dropped.
 */

import { describeError, describeTap, reportable } from "@shop/shared";

const BUFFER_KEY = "mx-analytics-buffer";
const ANON_KEY = "mx-aid";
const SESSION_KEY = "mx-sid";
const FLUSH_INTERVAL_MS = 15_000;
/** Matches the backend's per-batch cap for the open web. */
const MAX_BUFFERED = 50;

interface SiteEvent {
  event: string;
  target?: string;
  path?: string;
  meta?: string;
  clientTime: string;
}

let buffer: SiteEvent[] = [];
let started = false;
let flushing = false;

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function stored(storage: Storage | undefined, key: string): string {
  try {
    const existing = storage?.getItem(key);
    if (existing) return existing;
    const fresh = randomId();
    storage?.setItem(key, fresh);
    return fresh;
  } catch {
    return "anon-unavailable";
  }
}

function anonId(): string {
  return stored(typeof localStorage === "undefined" ? undefined : localStorage, ANON_KEY);
}

function sessionId(): string {
  return stored(typeof sessionStorage === "undefined" ? undefined : sessionStorage, SESSION_KEY);
}

function persist() {
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
  } catch {
    /* private mode — the in-memory buffer still works */
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    if (raw) buffer = (JSON.parse(raw) as SiteEvent[]).slice(-MAX_BUFFERED);
  } catch {
    buffer = [];
  }
}

function track(event: string, meta?: Record<string, unknown> | string, target?: string) {
  try {
    buffer.push({
      event,
      target,
      path: typeof location === "undefined" ? undefined : location.pathname,
      meta: meta === undefined ? undefined : typeof meta === "string" ? meta : JSON.stringify(meta),
      clientTime: new Date().toISOString(),
    });
    if (buffer.length > MAX_BUFFERED) buffer = buffer.slice(-MAX_BUFFERED);
    persist();
  } catch {
    /* never let instrumentation break a page */
  }
}

/** A page was shown (route change). */
export function trackPageView() {
  track("view");
}

export function trackProductView(productId: string) {
  track("product_view", { productId });
}

export function trackAddToCart(productId: string, variantId: string | null, qty: number) {
  track("add_to_cart", { productId, variantId, qty });
}

export function trackCheckoutStart() {
  track("checkout_start");
}

export function trackOrderCreated(orderId: string) {
  track("order_created", { orderId });
  void flush(true);
}

/** Sends the buffer; a 5xx/network failure puts the events back, a 4xx drops them. */
export async function flush(keepalive = false): Promise<void> {
  if (flushing || buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  persist();
  flushing = true;
  try {
    const res = await fetch("/api/public/analytics", {
      method: "POST",
      keepalive,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonId: anonId(), sessionId: sessionId(), events: batch }),
    });
    if (!res.ok && res.status >= 500) throw new Error(String(res.status));
  } catch {
    buffer = [...batch, ...buffer].slice(-MAX_BUFFERED);
    persist();
  } finally {
    flushing = false;
  }
}

/** Installs the flush timer and the "page is going away" flush once. */
export function startAnalytics(): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  restore();
  const onHide = () => {
    if (document.visibilityState === "hidden") void flush(true);
  };
  const onPageHide = () => void flush(true);
  const onClick = (e: MouseEvent) => {
    try {
      const tap = describeTap(e);
      if (tap) track("click", tap.meta, tap.label);
    } catch {
      /* never let instrumentation break a page */
    }
  };
  // The site had no error journal at all — only the Mini App did.
  const onFailure = (e: ErrorEvent | PromiseRejectionEvent) => {
    try {
      const err = describeError(e);
      if (!reportable(err)) return;
      track("error", err.meta, err.message);
    } catch {
      /* never let instrumentation break a page */
    }
  };
  document.addEventListener("click", onClick, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("error", onFailure);
  window.addEventListener("unhandledrejection", onFailure);
  const timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    document.removeEventListener("click", onClick, { capture: true });
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("error", onFailure);
    window.removeEventListener("unhandledrejection", onFailure);
    started = false;
  };
}
