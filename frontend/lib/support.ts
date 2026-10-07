"use client";

/**
 * Support threads — questions to the shop that are not about an order (V43).
 * Endpoints: /api/me/support/** (see shared/src/support.ts); attachments go through the order-chat
 * upload (POST /api/me/uploads). Realtime: STOMP /topic/support/{threadId}.
 */
import {
  connectOrderChat as connect,
  supportTopic,
  type ChatConnection,
  type CreateSupportThreadRequest,
  type SendMessageRequest,
  type SupportConfig,
  type SupportMessage,
  type SupportThread,
} from "@shop/shared";
import { apiGet, apiPost, getAccessToken, getApiBase } from "@/lib/api";

export type { CreateSupportThreadRequest, SupportConfig, SupportMessage, SupportThread };

export const supportApi = {
  config: () => apiGet<SupportConfig>("/api/me/support/config"),
  unreadCount: () => apiGet<{ count: number }>("/api/me/support/unread-count"),
  threads: () => apiGet<SupportThread[]>("/api/me/support/threads"),
  thread: (id: string) => apiGet<SupportThread>(`/api/me/support/threads/${id}`),
  create: (body: CreateSupportThreadRequest) => apiPost<SupportThread>("/api/me/support/threads", body),
  messages: (id: string, before?: number) =>
    apiGet<SupportMessage[]>(
      `/api/me/support/threads/${id}/messages${before ? `?before=${before}` : ""}`
    ),
  send: (id: string, body: SendMessageRequest) =>
    apiPost<SupportMessage>(`/api/me/support/threads/${id}/messages`, body),
  markRead: (id: string) => apiPost<void>(`/api/me/support/threads/${id}/read`),
  close: (id: string) => apiPost<SupportThread>(`/api/me/support/threads/${id}/close`),
};

/** Live messages of one thread; reads the in-memory token on every (re)connect. */
export function connectSupportChat(
  threadId: string,
  onMessage: (msg: SupportMessage) => void,
  onStatus?: (connected: boolean) => void
): ChatConnection {
  return connect({
    baseUrl: getApiBase(),
    orderId: threadId,
    topic: supportTopic(threadId),
    getToken: getAccessToken,
    onMessage: (m) => onMessage(m as unknown as SupportMessage),
    onStatus,
  });
}

/** Deep link `support_<threadId>` from the bot's "support replied" button. */
export function parseSupportDeepLink(param: string | null): string | null {
  if (!param) return null;
  const m = /^support[_-](.+)$/.exec(param);
  return m ? m[1] : null;
}
