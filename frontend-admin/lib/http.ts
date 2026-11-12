/**
 * HTTP-клиент админки: Bearer-токен из сессии, русские ответы сервера, куки доверенного устройства.
 * Пути эндпоинтов — только в `features/<фича>/api.ts`.
 */
import { createHttpClient } from "@shop/core/http";
import { apiOrigin } from "./origin";
import { dropSession, getAccessToken, maybeRefresh } from "./session";

/** Who wants to know about a refused admin call (the panel's telemetry): status and request path. */
type AuthFailureListener = (status: number, path: string) => void;
const authFailureListeners = new Set<AuthFailureListener>();

export function onAuthFailure(cb: AuthFailureListener): () => void {
  authFailureListeners.add(cb);
  return () => authFailureListeners.delete(cb);
}

const http = createHttpClient({
  baseUrl: apiOrigin,
  // The «trusted device» cookie (HttpOnly, path /api/auth/admin) has to travel with the sign-in
  // calls; prod is same-origin anyway, the e2e/dev split origins need "include".
  credentials: "include",
  // The admin is Russian-only: server errors must not follow the browser language (uk by default).
  getLocale: () => "ru",
  getToken: () => {
    const token = getAccessToken();
    if (token) maybeRefresh(token);
    return token;
  },
  onUnauthorized: (status, code, path) => {
    // Listeners first: the session drop below unmounts the shell and its telemetry.
    authFailureListeners.forEach((cb) => {
      try {
        cb(status, path ?? "");
      } catch {
        /* a listener never breaks the request */
      }
    });
    // Only «not signed in» ends the session: 401 = no / expired / revoked token (also every device
    // after «Выйти везде» — the backend treats a revoked token as anonymous), 403 TWO_FACTOR_REQUIRED
    // = a half-finished sign-in token. Any other 403 is «signed in, but not allowed» (e.g. the
    // «Админы» section for a non-main admin): the admin stays in, the caller shows the message
    // («Недостаточно прав» — QueryState renders it as an empty state, actions as a toast).
    if (status === 401 || code === "TWO_FACTOR_REQUIRED") dropSession();
  },
});

export const apiGet = http.get;
export const apiPost = http.post;
export const apiPatch = http.patch;
export const apiPut = http.put;
export const apiDelete = http.del;
/** Fire-and-forget POST with keepalive (telemetry flush, also on pagehide): no 401 handling, errors swallowed. */
export const apiPostOnUnload = http.postOnUnload;

/**
 * Multipart upload -> { key } (POST /api/admin/uploads); `T` — другая форма ответа (рассылка: { photoId }).
 * `onProgress` (доля отправленного, 0…1) — для полосы загрузки: тогда запрос идёт через XHR.
 */
export function uploadFile<T = { key: string }>(path: string, file: File, onProgress?: (sent: number) => void): Promise<T> {
  return http.upload<T>(path, file, onProgress);
}
