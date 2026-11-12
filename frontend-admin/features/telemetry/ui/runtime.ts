/**
 * Телеметрия админки на устройстве (жалоба «на iPhone виснет и не реагирует на тапы, пока не перезайдёшь»;
 * сервер в это время ничего не видит). Ловит: ошибки JS, зависания главного потока, тапы в невидимый слой,
 * «злые» тапы без реакции, 401/403 админского API; к каждому событию прикладывает последние шаги (`meta.trail`).
 *
 * Включается только внутри оболочки после входа (`useAdminTelemetry` в AppRuntime), в dev — только с
 * NEXT_PUBLIC_TELEMETRY_DEV=1. Отправка — раз в 15 с и при уходе страницы в фон / закрытии, keepalive-запросом с
 * токеном. Ничего не бросает и ничего не блокирует; персональных данных не шлёт (пути без id, без значений полей).
 */
import { ApiError } from "@shop/core/errors";
import { localStore } from "@shop/core/storage";
import { nowMs } from "@shop/core/time";
import { onAuthFailure } from "@/lib/http";
import { sendTelemetry, TELEMETRY_PATH } from "../api";
import { classifyTap } from "../model/blocked-tap";
import { createTelemetryClient, type TelemetryClient, type TelemetryContext, type TelemetryEvent } from "../model/client";
import { createDeadTapDetector } from "../model/dead-taps";
import { FREEZE_THRESHOLD_MS, HEARTBEAT_MS, stallOf, type Tick } from "../model/freeze";
import { fileBasename, sanitizePath, scrubText, shortUa, stackHead } from "../model/sanitize";
import { probeTap, tapMeta } from "./dom-probe";
import { installFetchCounter } from "./fetch-counter";

export const TELEMETRY_ENABLED =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_TELEMETRY_DEV === "1";

const FLUSH_MS = 15_000;
/** Неотправленное при выходе из сессии (401 — токен уже не годится): уйдёт после следующего входа. */
const PENDING_KEY = "tgshop_admin_telemetry_pending";
const PENDING_MAX = 30;

let client: TelemetryClient | null = null;
let running = false;
let navSeq = 0;
let netSeq = 0;
let epoch = 0;
let lastPath = "";

function isStandalone(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

function context(): TelemetryContext {
  return {
    path: sanitizePath(window.location.pathname, window.location.search),
    build: (process.env.NEXT_PUBLIC_APP_BUILD || "unknown").slice(0, 40),
    ua: shortUa(navigator.userAgent),
    standalone: isStandalone(),
  };
}

function getClient(): TelemetryClient {
  if (!client) {
    client = createTelemetryClient({
      now: nowMs,
      context,
      send: (events) => sendTelemetry({ events }),
    });
  }
  return client;
}

function errorMeta(source: string, err: unknown, fallback?: string): { meta: Record<string, unknown>; message: string } {
  const e = err as { message?: unknown; stack?: unknown; digest?: unknown } | null;
  const message = scrubText(e && typeof e === "object" && "message" in e ? e.message : (err ?? fallback));
  const meta: Record<string, unknown> = { source, message, stack: stackHead(e?.stack) };
  if (err instanceof ApiError) {
    meta.status = err.status;
    if (err.code) meta.code = err.code;
  }
  if (typeof e?.digest === "string") meta.digest = e.digest.slice(0, 40);
  return { meta, message };
}

function onError(ev: ErrorEvent): void {
  const { meta, message } = errorMeta("window", ev.error, ev.message);
  if (!ev.error) meta.message = scrubText(ev.message);
  meta.file = fileBasename(ev.filename);
  meta.at = `${ev.lineno ?? 0}:${ev.colno ?? 0}`;
  getClient().report("error", meta, message || scrubText(ev.message));
}

function onRejection(ev: PromiseRejectionEvent): void {
  const { meta, message } = errorMeta("unhandledrejection", ev.reason);
  getClient().report("error", meta, message);
}

const deadTaps = createDeadTapDetector();

function onPointerDown(ev: PointerEvent): void {
  if (!ev.isPrimary) return;
  try {
    const probe = probeTap(ev.clientX, ev.clientY);
    const blocked = classifyTap(probe.snapshot);
    if (blocked) {
      getClient().report("blocked_tap", { reason: blocked.reason, ...tapMeta(probe, blocked.layerIndex) }, blocked.reason);
    }
    const burst = deadTaps.push({ x: ev.clientX, y: ev.clientY, at: performance.now(), nav: navSeq, net: netSeq });
    if (burst) {
      const first = burst[0];
      const span = first ? Math.round(performance.now() - first.at) : 0;
      const meta = { taps: burst.length, spanMs: span, blocked: blocked?.reason ?? null, ...tapMeta(probe) };
      getClient().report("dead_taps", meta, probe.hit?.tagName ?? "");
    }
  } catch {
    /* телеметрия молчит */
  }
}

function onVisibility(): void {
  epoch += 1;
  const hidden = document.visibilityState !== "visible";
  getClient().crumb(hidden ? "hide" : "show");
  if (hidden) getClient().flush();
}

function onPageHide(ev: PageTransitionEvent): void {
  getClient().crumb(ev.persisted ? "pagehide-bfcache" : "pagehide");
  getClient().flush();
}

function onPageShow(ev: PageTransitionEvent): void {
  if (!ev.persisted) return;
  epoch += 1; // iOS вернул страницу из bfcache: таймеры стояли, это не зависание
  getClient().crumb("bfcache-restore");
}

function startHeartbeat(): () => void {
  let prev: Tick | null = null;
  const id = window.setInterval(() => {
    const cur: Tick = { at: performance.now(), visible: document.visibilityState === "visible", epoch };
    const stall = stallOf(prev, cur);
    prev = cur;
    if (stall !== null) getClient().report("freeze", { stallMs: stall, source: "heartbeat" });
  }, HEARTBEAT_MS);
  return () => window.clearInterval(id);
}

/** Safari `longtask` не умеет — тогда только сердцебиение. */
function startLongTasks(): () => void {
  try {
    if (typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      return () => undefined;
    }
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= FREEZE_THRESHOLD_MS && document.visibilityState === "visible") {
          getClient().report("freeze", { stallMs: Math.round(entry.duration), source: "longtask" });
        }
      }
    });
    obs.observe({ type: "longtask" });
    return () => obs.disconnect();
  } catch {
    return () => undefined;
  }
}

function restorePending(): void {
  const pending = localStore.getJson<TelemetryEvent[]>(PENDING_KEY);
  localStore.removeItem(PENDING_KEY);
  if (!Array.isArray(pending) || pending.length === 0) return;
  getClient().enqueue(pending.slice(-PENDING_MAX).map((e) => ({ ...e, meta: { ...e.meta, deferred: true } })));
}

function parkUnsent(): void {
  const left = getClient().drain();
  if (left.length > 0) localStore.setJson(PENDING_KEY, left.slice(-PENDING_MAX));
}

/** Запустить сбор (один раз на оболочку); возвращает остановку. */
export function startTelemetry(): () => void {
  if (running || typeof window === "undefined") return () => undefined;
  running = true;
  restorePending();
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  const stops = [
    startHeartbeat(),
    startLongTasks(),
    installFetchCounter(() => {
      netSeq += 1;
    }, TELEMETRY_PATH),
    onAuthFailure((status, path) => {
      // Не отправляем сразу: после 401 токен уже не примут. Сессия закончится, оболочка закроется, и событие
      // уйдёт в отложенные (parkUnsent) — его отправит следующий вход. 403 уйдёт с обычной отправкой.
      getClient().report("api_401", { status, endpoint: sanitizePath(path.split("?")[0] ?? "") });
    }),
  ];
  const flushTimer = window.setInterval(() => getClient().flush(), FLUSH_MS);
  getClient().flush();
  return () => {
    window.clearInterval(flushTimer);
    stops.forEach((stop) => stop());
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    document.removeEventListener("pointerdown", onPointerDown, { capture: true });
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    getClient().flush();
    parkUnsent();
    running = false;
  };
}

/** Смена экрана: хлебная крошка и счётчик переходов («злые тапы» не считаются, если экран сменился). */
export function noteRoute(pathname: string): void {
  const path = sanitizePath(pathname);
  if (path === lastPath) return;
  lastPath = path;
  navSeq += 1;
  getClient().crumb("route", path);
}

/** Ошибка рендера из error.tsx / global-error.tsx: в очередь и сразу отправить — оболочки может уже не быть. */
export function reportRenderError(error: unknown, source: "page" | "global"): void {
  if (!TELEMETRY_ENABLED || typeof window === "undefined") return;
  try {
    const { meta, message } = errorMeta(source === "page" ? "react-page" : "react-global", error);
    getClient().report("error", meta, message);
    getClient().flush();
  } catch {
    /* телеметрия молчит */
  }
}
