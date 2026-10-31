/**
 * Пути предзаказов — единственное место. HTTP-клиент и способ авторизации даёт приложение: Mini App ходит с
 * Bearer-токеном, сайт — с cookie-сессией и «обнови и повтори» (`authed`).
 */
import type { HttpClient } from "@shop/core/http";
import type { ComingBatch, MyPreorder, ProductPreorder } from "./types";

export interface PreorderApi {
  /** Открытые партии, ближайшая первой (публично). */
  coming(): Promise<ComingBatch[]>;
  /** Блок предзаказа товара для гостя (без «моих»). */
  forProductPublic(productId: string): Promise<ProductPreorder>;
  /** То же для вошедшего: с моими местами. */
  forProduct(productId: string): Promise<ProductPreorder>;
  mine(): Promise<MyPreorder[]>;
  /** `variantId` уходит в тело как есть: Mini App передаёт undefined (поле опущено), сайт — null. */
  subscribe(productId: string, variantId: string | null | undefined, qty: number): Promise<MyPreorder>;
  leave(id: number): Promise<void>;
}

export function createPreorderApi(
  http: Pick<HttpClient, "get" | "post" | "del">,
  authed: <T>(call: () => Promise<T>) => Promise<T> = (call) => call(),
): PreorderApi {
  return {
    coming: () => http.get<ComingBatch[]>("/api/public/preorders"),
    forProductPublic: (id) => http.get<ProductPreorder>(`/api/public/products/${id}/preorder`),
    forProduct: (id) => authed(() => http.get<ProductPreorder>(`/api/me/preorders/product/${id}`)),
    mine: () => authed(() => http.get<MyPreorder[]>("/api/me/preorders")),
    subscribe: (productId, variantId, qty) => authed(() => http.post<MyPreorder>("/api/me/preorders", { productId, variantId, qty })),
    leave: (id) => authed(() => http.del<void>(`/api/me/preorders/${id}`)),
  };
}
