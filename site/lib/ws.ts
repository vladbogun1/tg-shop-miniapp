"use client";

/**
 * Order-chat realtime for the website: the shared STOMP client in cookie mode. The browser sends
 * the HttpOnly `access` cookie with the same-origin `/ws` handshake, and the backend reads the JWT
 * from it (SITE-SPEC: HandshakeInterceptor) — no token ever reaches JavaScript.
 *
 * A reconnect after the 15-minute access cookie expires would be refused; the chat page refreshes
 * the session before (re)connecting, see `refreshSession` in lib/api.
 */
import { connectOrderChat as connect, type ChatConnection, type Message } from "@shop/shared";

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
