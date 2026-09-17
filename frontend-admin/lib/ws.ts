"use client";

/**
 * Order-chat realtime connection for the admin panel.
 *
 * The previous version built a single STOMP client at module scope, capturing the token at that
 * moment: after a logout/login every reconnect still presented the old one, and subscriptions
 * queued before the socket opened were never cancelled when a component unmounted. The shared
 * client reads the token on each connect and each subscription owns its connection.
 */
import { connectOrderChat, type ChatConnection, type Message } from "@shop/shared";
import { apiOrigin, getAccessToken } from "./api";

export type { ChatConnection };

/** Subscribe to an order's chat. Returns an unsubscribe function. */
export function subscribeOrderChat(
  orderId: string,
  onMessage: (msg: Message) => void,
  onStatus?: (connected: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const connection: ChatConnection = connectOrderChat({
    baseUrl: apiOrigin,
    orderId,
    getToken: getAccessToken,
    onMessage,
    onStatus,
  });
  return () => connection.disconnect();
}
