"use client";

/**
 * «Поддержка» — customer questions that are not tied to an order (about a product before buying
 * it, or a general one). Kept apart from lib/api.ts so parallel work on that file does not collide;
 * same http client, same error type.
 *
 *  GET  /api/admin/support/unread-count            → { count } open threads waiting for an answer
 *  GET  /api/admin/support/threads?filter=&q=&limit= → SupportThread[] (latest activity first)
 *  GET  /api/admin/support/threads/{id}            → SupportThread
 *  GET  /api/admin/support/threads/{id}/messages   → SupportMessage[] oldest-first, `before` = older
 *  POST /api/admin/support/threads/{id}/messages   → SupportMessage
 *  POST /api/admin/support/threads/{id}/attachments (multipart) → { key }
 *  POST /api/admin/support/threads/{id}/read | close | reopen
 *  STOMP /topic/support/{threadId} → SupportMessage
 */
import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  connectOrderChat,
  supportTopic,
  type ChatConnection,
  type SupportMessage,
  type SupportThread,
} from "@shop/shared";
import {
  apiGet,
  apiOrigin,
  apiPost,
  getAccessToken,
  isAuthenticated,
  uploadFile,
  type SendMessageRequest,
} from "./api";

export type { SupportMessage, SupportThread };

export type SupportFilter = "open" | "awaiting" | "closed" | "all";

/** Page size of the thread chat (the backend default). */
export const SUPPORT_CHAT_PAGE = 50;

export const supportApi = {
  unreadCount: () => apiGet<{ count: number }>("/api/admin/support/unread-count"),

  threads: (params: { filter?: SupportFilter; q?: string; limit?: number } = {}) => {
    const sp = new URLSearchParams();
    sp.set("filter", params.filter ?? "open");
    if (params.q) sp.set("q", params.q);
    if (params.limit) sp.set("limit", String(params.limit));
    return apiGet<SupportThread[]>(`/api/admin/support/threads?${sp.toString()}`);
  },

  thread: (id: string) => apiGet<SupportThread>(`/api/admin/support/threads/${encodeURIComponent(id)}`),

  /** Newest `limit` messages before `before` (oldest first). */
  messages: (id: string, before?: number, limit = SUPPORT_CHAT_PAGE) => {
    const sp = new URLSearchParams();
    if (before) sp.set("before", String(before));
    sp.set("limit", String(limit));
    return apiGet<SupportMessage[]>(
      `/api/admin/support/threads/${encodeURIComponent(id)}/messages?${sp.toString()}`
    );
  },

  send: (id: string, body: SendMessageRequest) =>
    apiPost<SupportMessage>(`/api/admin/support/threads/${encodeURIComponent(id)}/messages`, body),

  /** Picture or PDF → { key }, stored privately under chat/ (signed links). */
  uploadAttachment: (id: string, file: File) =>
    uploadFile(`/api/admin/support/threads/${encodeURIComponent(id)}/attachments`, file),

  markRead: (id: string) => apiPost<void>(`/api/admin/support/threads/${encodeURIComponent(id)}/read`),

  close: (id: string) => apiPost<SupportThread>(`/api/admin/support/threads/${encodeURIComponent(id)}/close`),

  reopen: (id: string) => apiPost<SupportThread>(`/api/admin/support/threads/${encodeURIComponent(id)}/reopen`),
};

export const SUPPORT_KEY = ["admin", "support"] as const;
export const SUPPORT_UNREAD_KEY = [...SUPPORT_KEY, "unread"] as const;

/** Nav badge: open threads waiting for an answer. Polled every 30 s, like «Внимание». */
export function useSupportUnread() {
  return useQuery({
    queryKey: SUPPORT_UNREAD_KEY,
    queryFn: supportApi.unreadCount,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: isAuthenticated(),
  });
}

/** After reading / answering / closing: the list, the badge and «Внимание» change. */
export function refreshSupport(qc: QueryClient): void {
  // Not the open chat itself (["admin","support","messages",id]) — it is kept up to date in place.
  void qc.invalidateQueries({ queryKey: SUPPORT_KEY, predicate: (q) => q.queryKey[2] !== "messages" });
  void qc.invalidateQueries({ queryKey: ["admin", "inbox"] });
}

/** Subscribe to a thread's messages. Returns an unsubscribe function. */
export function subscribeSupportChat(
  threadId: string,
  onMessage: (msg: SupportMessage) => void,
  onStatus?: (connected: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const connection: ChatConnection = connectOrderChat({
    baseUrl: apiOrigin,
    orderId: threadId,
    topic: supportTopic(threadId),
    getToken: getAccessToken,
    // The payload is a SupportMessage (threadId instead of orderId); the client only parses JSON.
    onMessage: (msg) => onMessage(msg as unknown as SupportMessage),
    onStatus,
  });
  return () => connection.disconnect();
}

/** «Mini App» / «Сайт» — where the customer asked. */
export function sourceLabel(source?: string | null): string {
  return source === "WEB" ? "Сайт" : "Mini App";
}

/** Public product page on the site (Ukrainian is the main locale). */
export const SITE_BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://chisetup.com.ua").replace(/\/$/, "");

export function siteProductUrl(slug: string): string {
  return `${SITE_BASE_URL}/uk/product/${encodeURIComponent(slug)}`;
}
