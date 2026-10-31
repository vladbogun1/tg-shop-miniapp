/**
 * Пути обращений в поддержку (V43) — единственное место (docs/ARCHITECTURE-FRONT.md, шаг 5c). Вопросы к магазину
 * не про заказ: про товар до покупки или общий. HTTP-клиент и `authed` даёт приложение; различие двух приложений
 * вынесено в политику: сайт просит страницу истории с явным `limit`, Mini App — без него (как было).
 * Отказ — 400 с `code` (SUPPORT_COOLDOWN, SUPPORT_HOURLY_LIMIT…) и уже локализованным текстом.
 */
import type { HttpClient } from "@shop/core/http";
import type { CreateSupportThreadRequest, SupportConfig, SupportMessage, SupportThread } from "@shop/core/support";
import type { SendMessageRequest } from "@shop/core/types";

export interface SupportApiPolicy {
  /** Явный `limit` в запросе истории; без него сервер отдаёт страницу по умолчанию. */
  messagesLimit?: number;
}

export interface SupportApi {
  /** Без входа: включена ли поддержка и её лимиты (точки входа прячутся, пока `enabled` не true). */
  publicConfig(): Promise<SupportConfig>;
  config(): Promise<SupportConfig>;
  unreadCount(): Promise<{ count: number }>;
  threads(): Promise<SupportThread[]>;
  /** С `productId`: сообщение дописывается в ОТКРЫТОЕ обращение о товаре и оно возвращается. */
  create(body: CreateSupportThreadRequest): Promise<SupportThread>;
  thread(id: string): Promise<SupportThread>;
  /** Страница, старые сверху; `before` — id самого раннего из показанных. */
  messages(id: string, before?: number): Promise<SupportMessage[]>;
  /** Запись в ЗАКРЫТОЕ обращение открывает его заново. */
  send(id: string, body: SendMessageRequest): Promise<SupportMessage>;
  markRead(id: string): Promise<void>;
  close(id: string): Promise<SupportThread>;
  /** Тот же эндпоинт загрузки, что у чата заказа; возвращает ключ объекта для `attachmentUrl`. */
  upload(file: File): Promise<{ url: string }>;
}

export function createSupportApi(
  http: Pick<HttpClient, "get" | "post" | "upload">,
  authed: <T>(call: () => Promise<T>) => Promise<T>,
  policy: SupportApiPolicy = {},
): SupportApi {
  const t = (id: string) => `/api/me/support/threads/${id}`;
  return {
    publicConfig: () => http.get<SupportConfig>("/api/public/support/config"),
    config: () => authed(() => http.get<SupportConfig>("/api/me/support/config")),
    unreadCount: () => authed(() => http.get<{ count: number }>("/api/me/support/unread-count")),
    threads: () => authed(() => http.get<SupportThread[]>("/api/me/support/threads")),
    create: (body) => authed(() => http.post<SupportThread>("/api/me/support/threads", body)),
    thread: (id) => authed(() => http.get<SupportThread>(t(id))),
    messages: (id, before) => {
      const q =
        policy.messagesLimit !== undefined
          ? `?limit=${policy.messagesLimit}${before ? `&before=${before}` : ""}`
          : before
            ? `?before=${before}`
            : "";
      return authed(() => http.get<SupportMessage[]>(`${t(id)}/messages${q}`));
    },
    send: (id, body) => authed(() => http.post<SupportMessage>(`${t(id)}/messages`, body)),
    markRead: (id) => authed(() => http.post<void>(`${t(id)}/read`)),
    close: (id) => authed(() => http.post<SupportThread>(`${t(id)}/close`)),
    upload: (file) => authed(() => http.upload<{ url: string }>("/api/me/uploads", file)),
  };
}
