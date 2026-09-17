"use client";

/**
 * Order-chat realtime connection.
 *
 * Thin wrapper over the shared STOMP client: it supplies this app's API origin and reads the
 * in-memory token on every (re)connect, so a chat opened from a deep link before authentication
 * finished connects as soon as the token arrives instead of retrying forever unauthenticated.
 */
import { connectOrderChat as connect, type ChatConnection, type Message } from "@shop/shared";
import { getAccessToken, getApiBase } from "@/lib/api";

export type { ChatConnection };

export function connectOrderChat(
  orderId: string,
  onMessage: (msg: Message) => void,
  onStatus?: (connected: boolean) => void
): ChatConnection {
  return connect({
    baseUrl: getApiBase(),
    orderId,
    getToken: getAccessToken,
    onMessage,
    onStatus,
  });
}
