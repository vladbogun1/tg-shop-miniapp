/**
 * Сессия админки: токен в localStorage, выход, тихое обновление токена.
 *
 * Прямой `fetch` здесь осознанный (разрешён в eslint.config.mjs): «Выйти» должно сработать с keepalive даже при
 * недоступном бэкенде, а неудачное обновление токена не должно разлогинивать (клиент `http` в обоих случаях
 * вызвал бы `onUnauthorized` или не умеет keepalive).
 */
import { markStaffBrowser } from "./staff-mark";
import type { Schemas } from "@shop/core/api/schemas";
import { ApiError } from "@shop/core/errors";
import { localStore } from "@shop/core/storage";
import { nowMs } from "@shop/core/time";
import { apiOrigin } from "./origin";

// ---- token store (localStorage) --------------------------------------------
const TOKEN_KEY = "tgshop_admin_jwt";
let accessToken: string | null = null;

const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(cb: () => void): () => void {
  unauthorizedListeners.add(cb);
  return () => unauthorizedListeners.delete(cb);
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) markStaffBrowser();
  if (typeof window !== "undefined") {
    if (token) localStore.setItem(TOKEN_KEY, token);
    else localStore.removeItem(TOKEN_KEY);
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    accessToken = localStore.getItem(TOKEN_KEY);
    // Admins already signed in before the staff mark existed get it on their next visit.
    if (accessToken) markStaffBrowser();
  }
  return accessToken;
}

/** «Signed in, but this action / page is not allowed» — a 403 that does not end the session. */
export function isForbidden(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403 && e.code !== "TWO_FACTOR_REQUIRED";
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function dropSession(): void {
  setAccessToken(null);
  unauthorizedListeners.forEach((cb) => cb());
}

/**
 * «Выйти»: the server revokes THIS token (other devices stay logged in), then the session is
 * dropped locally. Fire-and-forget — leaving must work even when the backend is unreachable.
 */
export function logout(): void {
  const token = getAccessToken();
  if (token) {
    void fetch(`${apiOrigin}/api/admin/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      keepalive: true,
    }).catch(() => undefined);
  }
  dropSession();
}

// ---- quiet token renewal ----------------------------------------------------
// Admin tokens are short-lived (12 h by default). Once the current one is past half its life,
// the next API call triggers one background refresh, so a panel in use never logs out while an
// abandoned one simply expires.

interface TokenTimes {
  iat: number;
  exp: number;
  /** Tokens from before short admin tokens had no id — those are swapped right away. */
  hasId: boolean;
}

function tokenTimes(token: string): TokenTimes | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { iat?: number; exp?: number; jti?: string };
    if (typeof claims.iat !== "number" || typeof claims.exp !== "number") return null;
    return { iat: claims.iat, exp: claims.exp, hasId: !!claims.jti };
  } catch {
    return null;
  }
}

const REFRESH_RETRY_MS = 60_000;
let refreshing = false;
let lastRefreshAttempt = 0;

export function maybeRefresh(token: string): void {
  if (refreshing || typeof window === "undefined") return;
  const t = tokenTimes(token);
  if (!t) return;
  const now = nowMs() / 1000;
  if (now >= t.exp) return; // already expired: the request will 401 and show the login screen
  const halfLife = t.iat + (t.exp - t.iat) / 2;
  if (t.hasId && now < halfLife) return;
  if (nowMs() - lastRefreshAttempt < REFRESH_RETRY_MS) return;
  lastRefreshAttempt = nowMs();
  refreshing = true;
  // Plain fetch, not the client: a failed refresh must not log the admin out — the current token
  // is still valid, and the next call after a minute simply tries again.
  fetch(`${apiOrigin}/api/admin/token/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  })
    .then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json()) as Schemas["AccessTokenResponse"];
      // Only if nobody logged out / in meanwhile.
      if (body.accessToken && getAccessToken() === token) setAccessToken(body.accessToken);
    })
    .catch(() => undefined)
    .finally(() => {
      refreshing = false;
    });
}
