"use client";

/**
 * Order-chat realtime for the website: the shared STOMP client in cookie mode. The browser sends
 * the HttpOnly `access` cookie with the same-origin `/ws` handshake, and the backend reads the JWT
 * from it (SITE-SPEC: HandshakeInterceptor) — no token ever reaches JavaScript.
 *
 * A reconnect after the 15-minute access cookie expires would be refused; the chat page refreshes
 * the session before (re)connecting, see `refreshSession` in lib/api.
 */
import { connectOrderChat as connect, type ChatConnection } from "@shop/core/ws";
import { type Message } from "@shop/core/types";

export type { ChatConnection };

export function connectOrderChat(
  orderId: string,
  onMessage: (msg: Message) => void,
  onStatus?: (connected: boolean) => void
): ChatConnection {
  return connect({
    baseUrl: process.env.NEXT_PUBLIC_WS_ORIGIN ?? "",
    orderId,
    getToken: () => null,
    cookieAuth: true,
    onMessage,
    onStatus,
  });
}

/**
 * Realtime for one support thread: the same cookie-mode STOMP client, subscribed to
 * `/topic/support/{threadId}`. `toMessage` turns a raw frame into the chat-bubble shape.
 */
export function connectSupportThread(
  threadId: string,
  topic: string,
  onMessage: (raw: unknown) => void,
  onStatus?: (connected: boolean) => void
): ChatConnection {
  return connect({
    baseUrl: process.env.NEXT_PUBLIC_WS_ORIGIN ?? "",
    orderId: threadId,
    topic,
    getToken: () => null,
    cookieAuth: true,
    onMessage,
    onStatus,
  });
}
