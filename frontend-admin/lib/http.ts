/**
 * HTTP-клиент админки: Bearer-токен из сессии, русские ответы сервера, куки доверенного устройства.
 * Пути эндпоинтов — только в `features/<фича>/api.ts`.
 */
import { createHttpClient } from "@shop/core/http";
import { apiOrigin } from "./origin";
import { dropSession, getAccessToken, maybeRefresh } from "./session";

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
  onUnauthorized: (status, code) => {
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

/** Multipart upload -> { key } (POST /api/admin/uploads). */
export function uploadFile(path: string, file: File): Promise<{ key: string }> {
  return http.upload<{ key: string }>(path, file);
}
