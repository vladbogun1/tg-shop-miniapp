"use client";

/**
 * Единственное место, где админка открывает WebSocket/STOMP (правило ws-only-from-realtime).
 *
 * Клиент читает токен при каждом подключении (после выхода и входа переподключение не держит старый),
 * а каждая подписка владеет своим соединением и закрывает его при отписке. Что делать с сообщением
 * (дописать в кэш чата, пометить прочитанным) решает фича — здесь только транспорт.
 */
import { connectOrderChat, type ChatConnection } from "@shop/core/ws";
import { supportTopic } from "@shop/core/support";
import type { Message } from "@shop/core/types";
import { apiOrigin } from "@/lib/origin";
import { getAccessToken } from "@/lib/session";

export type { ChatConnection };

/** STOMP `/topic/orders/{id}/chat`. Возвращает функцию отписки. */
export function subscribeOrderChat(
  orderId: string,
  onMessage: (msg: Message) => void,
  onStatus?: (connected: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const connection = connectOrderChat({ baseUrl: apiOrigin, orderId, getToken: getAccessToken, onMessage, onStatus });
  return () => connection.disconnect();
}

/**
 * STOMP `/topic/support/{threadId}`. Тело — сообщение поддержки (`threadId` вместо `orderId`); клиент лишь
 * разбирает JSON, поэтому тип сообщения задаёт вызывающая фича. Возвращает функцию отписки.
 */
export function subscribeSupportThread<T>(
  threadId: string,
  onMessage: (msg: T) => void,
  onStatus?: (connected: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const connection = connectOrderChat({
    baseUrl: apiOrigin,
    orderId: threadId,
    topic: supportTopic(threadId),
    getToken: getAccessToken,
    onMessage: (msg) => onMessage(msg as unknown as T),
    onStatus,
  });
  return () => connection.disconnect();
}
