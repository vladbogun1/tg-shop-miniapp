"use client";

/**
 * Client-side interaction journal.
 *
 * Until now the only trace a customer left was the order (or the absence of one), so "it lagged
 * and I couldn't get out of the chat" had nothing behind it to look at. Every tap, screen view and
 * client-side error is recorded HERE, in the browser, and shipped to the backend in batches — a
 * write per tap would put the shop's database on the critical path of the UI, which is precisely
 * what it must not be.
 *
 * Guarantees this keeps:
 *   - nothing it does can break a screen: every path is wrapped, failures are dropped;
 *   - the buffer survives a reload (localStorage) but is capped, so it cannot grow without bound;
 *   - a flush is attempted when the app is hidden or closed — that is the moment worth capturing.
 *
 * It records what was tapped and where, never what was typed: field values never enter the buffer.
 */
import { getAccessToken, getApiBase } from "@/lib/api";

const BUFFER_KEY = "analytics-buffer";
const SESSION_KEY = "analytics-session";
const FLUSH_INTERVAL_MS = 15_000;
/** Matches the server's per-batch cap; beyond it the oldest events are dropped. */
const MAX_BUFFERED = 200;

export interface ClientEvent {
  event: string;
  target?: string;
  path?: string;
  meta?: string;
  clientTime: string;
}

let buffer: ClientEvent[] = [];
let started = false;
let flushing = false;

function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s${Date.now()}${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return "no-session";
  }
}

function persist() {
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
  } catch {
    /* private mode / quota — the in-memory buffer still works */
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    if (raw) buffer = (JSON.parse(raw) as ClientEvent[]).slice(-MAX_BUFFERED);
  } catch {
    buffer = [];
  }
}

/** Records one event. Cheap and synchronous: it only appends to the local buffer. */
export function track(event: string, target?: string, meta?: string) {
  try {
    buffer.push({
      event,
      target,
      path: typeof location === "undefined" ? undefined : location.pathname,
      meta,
      clientTime: new Date().toISOString(),
    });
    if (buffer.length > MAX_BUFFERED) buffer = buffer.slice(-MAX_BUFFERED);
    persist();
  } catch {
    /* never let instrumentation break a screen */
  }
}

/**
 * Sends what is buffered. `keepalive` is used when the app is going away — a normal fetch is
 * cancelled on unload, which is exactly when the most interesting events are sitting in the buffer.
 */
export async function flush(keepalive = false): Promise<void> {
  if (flushing || buffer.length === 0) return;
  const token = getAccessToken();
  if (!token) return; // nothing to attribute the events to yet

  const batch = buffer;
  buffer = [];
  persist();
  flushing = true;
  try {
    const res = await fetch(`${getApiBase()}/api/me/analytics`, {
      method: "POST",
      keepalive,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId: sessionId(), events: batch }),
    });
    // 4xx means the server will never take this batch (bad shape, rate limit): dropping it is
    // correct. A 5xx or a network error is transient, so the events go back into the buffer.
    if (!res.ok && res.status >= 500) throw new Error(String(res.status));
  } catch {
    buffer = [...batch, ...buffer].slice(-MAX_BUFFERED);
    persist();
  } finally {
    flushing = false;
  }
}

/** A short, privacy-safe description of what was tapped. */
function describe(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  const el = target.closest("[data-analytics],button,a,input,textarea,[role='button']");
  if (!el) return undefined;

  const name = el.getAttribute("data-analytics");
  if (name) return name.slice(0, 120);

  const tag = el.tagName.toLowerCase();
  // Never read a value: the buffer must not end up holding phone numbers or promo codes.
  if (tag === "input" || tag === "textarea") {
    return `${tag}:${el.getAttribute("aria-label") ?? el.getAttribute("name") ?? "field"}`;
  }
  const label =
    el.getAttribute("aria-label") ?? (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return `${tag}:${label.slice(0, 60)}`;
}

/** Installs the listeners once. Safe to call from every mount. */
export function startAnalytics(): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  restore();

  const onClick = (e: MouseEvent) => track("click", describe(e.target));
  const onError = (e: ErrorEvent) => track("error", e.message?.slice(0, 120));
  const onRejection = (e: PromiseRejectionEvent) =>
    track("error", String(e.reason).slice(0, 120));
  const onHide = () => {
    if (document.visibilityState === "hidden") void flush(true);
  };

  document.addEventListener("click", onClick, { capture: true, passive: true });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", () => void flush(true));

  const timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);

  return () => {
    clearInterval(timer);
    document.removeEventListener("click", onClick, { capture: true });
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    document.removeEventListener("visibilitychange", onHide);
    started = false;
  };
}
