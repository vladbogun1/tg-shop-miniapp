/**
 * Пути оформления заказа — единственное место (docs/ARCHITECTURE-FRONT.md, шаг 5b): варианты оплаты, лимиты
 * антиспама, промокод (проверка / бронь / снятие брони), Нова пошта (города, отделения, отделения в окне карты),
 * создание заказа. HTTP-клиент и способ авторизации даёт приложение: на сайте закрытые вызовы оборачиваются
 * в «обнови сессию и повтори» (`authed`); публичные (проверка промокода, НП, лимиты, варианты оплаты) — нет.
 */
import type { HttpClient } from "@shop/core/http";
import type { CreateOrderResult, NpCity, NpWarehouse, OrderLimits, PaymentOption, PromoPreview } from "@shop/core/types";

export interface CreateOrderItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface CreateOrderRequest {
  items: CreateOrderItem[];
  customerName: string;
  phone: string;
  comment?: string;
  promoCode?: string;
  deliveryMethod: "NOVA_POSHTA" | "PICKUP";
  npCityRef?: string;
  npCityName?: string;
  npWarehouseRef?: string;
  npWarehouseName?: string;
  paymentOptionId: string;
  /** Подарок за сумму заказа: CASE (по умолчанию) или гарантированная скидка уровня на этот заказ. */
  giftChoice?: "CASE" | "DISCOUNT";
}

export interface NpBboxParams {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  category?: "all" | "postomat" | "branch" | "point";
  q?: string;
  limit?: number;
}

export interface CheckoutApi {
  paymentOptions(): Promise<PaymentOption[]>;
  /** Лимиты антиспама (0 = без лимита): шаговые счётчики зажимаются `maxQtyPerProduct`. */
  orderLimits(): Promise<OrderLimits>;
  /** Что стоит промокод для этой корзины — только чтение, использование не списывает. `items` — строки корзины. */
  previewPromo(code: string, subtotalMinor: number, items?: string): Promise<PromoPreview>;
  /** Проверяет код И держит ограниченный код за покупателем полчаса. */
  reservePromo(code: string, subtotalMinor: number, items?: string): Promise<PromoPreview>;
  /** Возвращает удержанный код, когда покупатель очистил или заменил его. */
  releasePromo(code: string): Promise<void>;
  npCities(q: string): Promise<NpCity[]>;
  npWarehouses(cityRef: string, q?: string): Promise<NpWarehouse[]>;
  npWarehousesBbox(p: NpBboxParams): Promise<NpWarehouse[]>;
  /** Создаёт заказ. Ключ идемпотентности: повтор (потерянный ответ, двойное нажатие) вернёт уже созданный заказ. */
  createOrder(body: CreateOrderRequest, idempotencyKey: string): Promise<CreateOrderResult>;
}

/** `&items=id*qty,…` для проверки промокода; пусто, если состав корзины неизвестен. */
function itemsParam(items: string): string {
  return items ? `&items=${encodeURIComponent(items)}` : "";
}

export function createCheckoutApi(
  http: Pick<HttpClient, "get" | "post" | "del">,
  authed: <T>(call: () => Promise<T>) => Promise<T> = (call) => call(),
): CheckoutApi {
  return {
    paymentOptions: () => http.get<PaymentOption[]>("/api/payment-options"),
    orderLimits: () => http.get<OrderLimits>("/api/public/order-limits"),
    previewPromo: (code, subtotalMinor, items = "") =>
      http.get<PromoPreview>(
        `/api/promo-codes/preview?code=${encodeURIComponent(code)}&subtotalMinor=${subtotalMinor}${itemsParam(items)}`,
      ),
    reservePromo: (code, subtotalMinor, items = "") =>
      authed(() =>
        http.post<PromoPreview>(
          `/api/me/promo/reserve?code=${encodeURIComponent(code)}&subtotalMinor=${subtotalMinor}${itemsParam(items)}`,
        ),
      ),
    releasePromo: (code) => authed(() => http.del<void>(`/api/me/promo/reserve?code=${encodeURIComponent(code)}`)),
    npCities: (q) => http.get<NpCity[]>(`/api/np/cities?q=${encodeURIComponent(q)}`),
    npWarehouses: (cityRef, q = "") =>
      http.get<NpWarehouse[]>(`/api/np/warehouses?cityRef=${encodeURIComponent(cityRef)}&q=${encodeURIComponent(q)}`),
    npWarehousesBbox: (p) => {
      const sp = new URLSearchParams({
        minLat: String(p.minLat),
        maxLat: String(p.maxLat),
        minLng: String(p.minLng),
        maxLng: String(p.maxLng),
        category: p.category ?? "all",
        limit: String(p.limit ?? 1200),
      });
      if (p.q) sp.set("q", p.q);
      return http.get<NpWarehouse[]>(`/api/np/warehouses/bbox?${sp.toString()}`);
    },
    createOrder: (body, idempotencyKey) =>
      authed(() => http.post<CreateOrderResult>("/api/orders", body, { "Idempotency-Key": idempotencyKey })),
  };
}
