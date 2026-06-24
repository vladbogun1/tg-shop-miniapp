"use client";

/**
 * STOMP-over-SockJS client for realtime chat (docs/SPEC.md WebSocket).
 *  - endpoint `/ws` (SockJS), JWT passed as query `?token=` and CONNECT header.
 *  - topic `/topic/orders/{orderId}/chat` -> new MessageDto.
 *
 * Lazy-connects a single shared client; subscriptions are reference-counted so
 * multiple components on the same order share one socket.
 */
import { Client, type IMessage } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { apiOrigin, getAccessToken } from "./api";
import type { MessageDto } from "./api";

let client: Client | null = null;
let connected = false;
const pending: (() => void)[] = [];

function ensureClient(): Client {
  if (client) return client;
  const token = getAccessToken() ?? "";
  const url = `${apiOrigin}/ws?token=${encodeURIComponent(token)}`;
  client = new Client({
    webSocketFactory: () => new SockJS(url) as unknown as WebSocket,
    connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    reconnectDelay: 4000,
    onConnect: () => {
      connected = true;
      while (pending.length) pending.shift()!();
    },
    onWebSocketClose: () => {
      connected = false;
    },
    // Silence STOMP debug noise.
    debug: () => {},
  });
  client.activate();
  return client;
}

/**
 * Subscribe to an order's chat topic. Returns an unsubscribe fn.
 * Safe no-op if there's no token (e.g. SSR).
 */
export function subscribeOrderChat(
  orderId: string,
  onMessage: (msg: MessageDto) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const c = ensureClient();
  let sub: { unsubscribe: () => void } | null = null;

  const doSub = () => {
    sub = c.subscribe(`/topic/orders/${orderId}/chat`, (frame: IMessage) => {
      try {
        onMessage(JSON.parse(frame.body) as MessageDto);
      } catch {
        /* ignore malformed */
      }
    });
  };

  if (connected) doSub();
  else pending.push(doSub);

  return () => {
    sub?.unsubscribe();
  };
}
