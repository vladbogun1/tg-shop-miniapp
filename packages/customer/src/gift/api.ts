/**
 * Пути подарка за сумму заказа и кейса (docs/GIFT-CASE.md) — единственное место: публичный подарок (без входа),
 * открытие кейса заказа, замена приза на скидку, выбор размера приза. HTTP-клиент и способ авторизации даёт
 * приложение: на сайте закрытые вызовы оборачиваются в «обнови сессию и повтори» (`authed`).
 */
import type { HttpClient } from "@shop/core/http";
import type { CaseSize, GiftCaseOpen, GiftResponse } from "@shop/core/giftcase";

export interface GiftApi {
  /** Что магазин дарит и от какой суммы; `gift: null` — выключено. Прогресс клиенты считают сами. */
  gift(): Promise<GiftResponse>;
  /** Открывает (показывает) кейс заказа; повтор — тот же приз. */
  openCase(orderId: string): Promise<GiftCaseOpen>;
  swapCase(orderId: string): Promise<GiftCaseOpen>;
  /** Размер приза-товара с размерами среди имеющихся в наличии. */
  chooseSize(orderId: string, variantId: string): Promise<CaseSize>;
}

export function createGiftApi(
  http: Pick<HttpClient, "get" | "post">,
  authed: <T>(call: () => Promise<T>) => Promise<T> = (call) => call(),
): GiftApi {
  return {
    gift: () => http.get<GiftResponse>("/api/public/gift"),
    openCase: (id) => authed(() => http.post<GiftCaseOpen>(`/api/me/orders/${id}/gift-case/open`)),
    swapCase: (id) => authed(() => http.post<GiftCaseOpen>(`/api/me/orders/${id}/gift-case/swap`)),
    chooseSize: (id, variantId) => authed(() => http.post<CaseSize>(`/api/me/orders/${id}/gift-case/size`, { variantId })),
  };
}
