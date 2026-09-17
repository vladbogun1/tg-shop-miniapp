/**
 * STOMP client for the order chat, shared by both apps.
 *
 * <p>Three problems this replaces:
 * <ul>
 *   <li>the JWT travelled in the URL (`/ws?token=…`), so it landed in proxy access logs, browser
 *       history and Referer headers — a leaked 30-day admin token is a full compromise. The token
 *       now only goes in the STOMP CONNECT frame, which works fine over a WebSocket;</li>
 *   <li>the admin built its client once at module scope and captured the token forever, so after a
 *       re-login every reconnect still presented the old one;</li>
 *   <li>subscriptions queued before the connection opened were never cancelled if the component
 *       unmounted first.</li>
 * </ul>
 *
 * <p>The token is read through a callback on every (re)connect, so a fresh login is picked up
 * automatically, and a connection is only attempted once a token exists.
 */
import { Client, type IMessage } from "@stomp/stompjs";
import type { Message } from "./types";

export interface ChatConnection {
  disconnect: () => void;
}

export interface ChatOptions {
  /** API origin, e.g. "https://shop.example" or "" for same-origin. */
  baseUrl: string;
  orderId: string;
  /** Read on every connect attempt, so re-logins are picked up. */
  getToken: () => string | null;
  onMessage: (msg: Message) => void;
  onStatus?: (connected: boolean) => void;
}

export function connectOrderChat(options: ChatOptions): ChatConnection {
  const { orderId, getToken, onMessage, onStatus } = options;
  const origin =
    options.baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
  const wsUrl = `${origin.replace(/^http/, "ws")}/ws`;

  let closed = false;

  const client = new Client({
    brokerURL: wsUrl,
    // Read fresh each attempt — a token that expired or changed mid-session must not be reused.
    beforeConnect: () => {
      const token = getToken();
      client.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {};
      if (!token) {
        // Nothing to authenticate with yet (auth still in flight): stop, and let the caller
        // reconnect once it has one. Hammering the server with anonymous CONNECTs is pointless.
        client.deactivate();
      }
    },
    reconnectDelay: 4000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    debug: () => {},
  });

  client.onConnect = () => {
    if (closed) return;
    onStatus?.(true);
    client.subscribe(`/topic/orders/${orderId}/chat`, (frame: IMessage) => {
      try {
        onMessage(JSON.parse(frame.body) as Message);
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
      closed = true;
      onStatus?.(false);
      void client.deactivate();
    },
  };
}
