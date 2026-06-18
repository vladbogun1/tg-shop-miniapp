"use client";

/**
 * STOMP-over-SockJS client helper for the order chat realtime channel.
 *
 * Endpoint: `${NEXT_PUBLIC_API_BASE_URL}/ws` (SockJS). JWT is passed both as a
 * `?token=` query param (docs/SPEC.md WebSocket) and in the CONNECT header
 * `Authorization` for belt-and-suspenders. Subscribe to
 * `/topic/orders/{orderId}/chat` — incoming payloads are MessageDto.
 *
 * Usage:
 *   const conn = connectOrderChat(orderId, token, (msg) => append(msg));
 *   ...
 *   conn.disconnect();
 */
import { Client, type IMessage } from "@stomp/stompjs";
import { getApiBase, type Message } from "@/lib/api";

// sockjs-client expects a Node-style `global`; alias it to `window` in the
// browser/webview before the module is loaded (it is imported dynamically
// inside connectOrderChat so this assignment runs first).
if (typeof window !== "undefined") {
  const w = window as unknown as { global?: unknown };
  if (typeof w.global === "undefined") w.global = window;
}

export interface ChatConnection {
  disconnect: () => void;
}

export function connectOrderChat(
  orderId: string,
  token: string | null,
  onMessage: (msg: Message) => void,
  onStatus?: (connected: boolean) => void
): ChatConnection {
  // Empty base = same-origin (single-origin public build) → SockJS needs an absolute URL.
  const base = getApiBase() || (typeof window !== "undefined" ? window.location.origin : "");
  const tokenQs = token ? `?token=${encodeURIComponent(token)}` : "";
  const wsUrl = `${base}/ws${tokenQs}`;

  const client = new Client({
    // SockJS factory (server endpoint is SockJS, not raw ws://). Loaded lazily
    // so the `global` polyfill above is in place first.
    webSocketFactory: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SockJS = require("sockjs-client") as new (u: string) => WebSocket;
      return new SockJS(wsUrl);
    },
    connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    reconnectDelay: 4000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    // Silence verbose framing logs in production.
    debug: () => {},
  });

  client.onConnect = () => {
    onStatus?.(true);
    client.subscribe(`/topic/orders/${orderId}/chat`, (frame: IMessage) => {
      try {
        const msg = JSON.parse(frame.body) as Message;
        onMessage(msg);
      } catch {
        /* ignore malformed frame */
      }
    });
  };

  client.onWebSocketClose = () => onStatus?.(false);
  client.onStompError = () => onStatus?.(false);

  client.activate();

  return {
    disconnect: () => {
      onStatus?.(false);
      void client.deactivate();
    },
  };
}
