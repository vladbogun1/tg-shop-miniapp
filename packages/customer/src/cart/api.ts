/**
 * Серверная корзина — единственное место с путями `/api/me/cart` (docs/SITE-SPEC.md, «Серверная корзина»).
 * HTTP-клиент и способ авторизации даёт приложение: на сайте вызов оборачивается в «обнови сессию и повтори».
 */
import type { CartLineInput, ServerCart } from "@shop/core/cart";
import type { HttpClient } from "@shop/core/http";

export interface CartApi {
  get(): Promise<ServerCart>;
  /** Заменить корзину целиком. */
  put(lines: CartLineInput[]): Promise<ServerCart>;
  /** Влить строки в корзину (одна и та же строка → большее количество). */
  merge(lines: CartLineInput[]): Promise<ServerCart>;
}

export function createCartApi(
  http: Pick<HttpClient, "get" | "put" | "post">,
  authed: <T>(call: () => Promise<T>) => Promise<T> = (call) => call(),
): CartApi {
  return {
    get: () => authed(() => http.get<ServerCart>("/api/me/cart")),
    put: (lines) => authed(() => http.put<ServerCart>("/api/me/cart", { lines })),
    merge: (lines) => authed(() => http.post<ServerCart>("/api/me/cart/merge", { lines })),
  };
}
