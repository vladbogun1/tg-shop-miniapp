/**
 * Пути заказов покупателя — единственное место (docs/ARCHITECTURE-FRONT.md, шаг 5c): список, заказ, оплата
 * (monobank), чеки, отмена, чат заказа. HTTP-клиент и способ авторизации даёт приложение: на сайте вызовы
 * оборачиваются в «обнови сессию и повтори» (`authed`), в Mini App токен уже в клиенте. Различие двух приложений —
 * только `returnTo`: куда monobank вернёт браузер после оплаты (политика приложения, не слияние поведения).
 */
import type { HttpClient } from "@shop/core/http";
import type { Receipt } from "@shop/core/receipts";
import type { Message, OrderDetail, OrderSummary, PaymentStart, SendMessageRequest } from "@shop/core/types";

/** `IFRAME` — страница под iframe (вернётся на /pay-return?embedded=1); без него — обычная страница. */
export type PaymentDisplay = "IFRAME" | "PAGE";

export interface OrderApi {
  list(): Promise<OrderSummary[]>;
  get(id: string): Promise<OrderDetail>;
  /**
   * Страница истории чата, старые сверху. Без `before` — самая свежая страница.
   * `before` — id самого раннего из уже загруженных сообщений.
   */
  messages(id: string, before?: number): Promise<Message[]>;
  sendMessage(id: string, body: SendMessageRequest): Promise<Message>;
  markRead(id: string): Promise<void>;
  uploadAttachment(file: File): Promise<{ url: string }>;
  /**
   * Платёжная страница monobank на то, что нужно оплатить сейчас. Живая страница переиспользуется: повторный
   * вызов вернёт ту же ссылку. 409 + `code`: PAYMENT_UNAVAILABLE | NOT_PAYABLE | PAYMENT_EXPIRED |
   * PAYMENT_IN_PROGRESS | PAYMENT_FAILED. Две разновидности (`IFRAME`, обычная) — отдельные счета:
   * запрос другой закрывает живую страницу первой.
   */
  startPayment(id: string, locale: string, display?: PaymentDisplay): Promise<PaymentStart>;
  /** Спрашивает monobank о статусе прямо сейчас (сервер пускает раз в 5 с) → заказ. */
  refreshPayment(id: string): Promise<OrderDetail>;
  /** Фискальные чеки и квитанция банка; `downloadUrl` подписан и относителен серверу. */
  receipts(id: string): Promise<Receipt[]>;
  cancel(id: string, reason?: string): Promise<OrderDetail>;
  /** Оплаченный заказ: попросить магазин отменить (причина обязательна, до 500). 400 + code при отказе. */
  requestCancel(id: string, reason: string): Promise<OrderDetail>;
}

export interface OrderApiPolicy {
  /** Куда monobank вернёт браузер: Mini App или сайт. */
  returnTo: "MINIAPP" | "SITE";
}

export function createOrderApi(
  http: Pick<HttpClient, "get" | "post" | "upload">,
  authed: <T>(call: () => Promise<T>) => Promise<T>,
  policy: OrderApiPolicy,
): OrderApi {
  const base = (id: string) => `/api/me/orders/${id}`;
  const get = <T>(path: string) => authed(() => http.get<T>(path));
  const post = <T>(path: string, body?: unknown) => authed(() => http.post<T>(path, body));
  return {
    list: () => get<OrderSummary[]>("/api/me/orders"),
    get: (id) => get<OrderDetail>(base(id)),
    messages: (id, before) => get<Message[]>(`${base(id)}/messages${before ? `?before=${before}` : ""}`),
    sendMessage: (id, body) => post<Message>(`${base(id)}/messages`, body),
    markRead: (id) => post<void>(`${base(id)}/messages/read`),
    uploadAttachment: (file) => authed(() => http.upload<{ url: string }>("/api/me/uploads", file)),
    startPayment: (id, locale, display) =>
      post<PaymentStart>(
        `${base(id)}/payment`,
        display === "IFRAME" ? { returnTo: policy.returnTo, locale, display } : { returnTo: policy.returnTo, locale },
      ),
    refreshPayment: (id) => post<OrderDetail>(`${base(id)}/payment/refresh`),
    receipts: (id) => get<Receipt[]>(`${base(id)}/receipts`),
    cancel: (id, reason) => post<OrderDetail>(`${base(id)}/cancel`, { reason }),
    requestCancel: (id, reason) => post<OrderDetail>(`${base(id)}/cancel-request`, { reason }),
  };
}

/** Без повтора после обновления сессии: Mini App держит токен в памяти, ему «обновлять» нечего. */
export const noAuthRetry = <T>(call: () => Promise<T>): Promise<T> => call();
