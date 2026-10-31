/**
 * «Поддержка» — вопросы покупателей, не привязанные к заказу (о товаре до покупки или общие).
 * Единственное место путей `/api/admin/support/**`.
 *
 *  GET  /api/admin/support/unread-count            → { count } open threads waiting for an answer
 *  GET  /api/admin/support/threads?filter=&q=&limit= → SupportThread[] (latest activity first)
 *  GET  /api/admin/support/threads/{id}            → SupportThread
 *  GET  /api/admin/support/threads/{id}/messages   → SupportMessage[] oldest-first, `before` = older
 *  POST /api/admin/support/threads/{id}/messages   → SupportMessage
 *  POST /api/admin/support/threads/{id}/attachments (multipart) → { key }
 *  POST /api/admin/support/threads/{id}/read | close | reopen
 */
import { apiGet, apiPost, uploadFile } from "@/lib/http";
import type { SendMessageRequest } from "@shop/core/types";
import { SUPPORT_CHAT_PAGE } from "./model/chat";
import type { SupportMessage, SupportThread, SupportThreadsQuery } from "./model/types";

const thread = (id: string) => `/api/admin/support/threads/${encodeURIComponent(id)}`;

export const supportApi = {
  unreadCount: () => apiGet<{ count: number }>("/api/admin/support/unread-count"),

  threads: (params: SupportThreadsQuery = {}) => {
    const sp = new URLSearchParams();
    sp.set("filter", params.filter ?? "open");
    if (params.q) sp.set("q", params.q);
    if (params.limit) sp.set("limit", String(params.limit));
    return apiGet<SupportThread[]>(`/api/admin/support/threads?${sp.toString()}`);
  },

  thread: (id: string) => apiGet<SupportThread>(thread(id)),

  /** Newest `limit` messages before `before` (oldest first). */
  messages: (id: string, before?: number, limit = SUPPORT_CHAT_PAGE) => {
    const sp = new URLSearchParams();
    if (before) sp.set("before", String(before));
    sp.set("limit", String(limit));
    return apiGet<SupportMessage[]>(`${thread(id)}/messages?${sp.toString()}`);
  },

  send: (id: string, body: SendMessageRequest) => apiPost<SupportMessage>(`${thread(id)}/messages`, body),

  /** Picture or PDF → { key }, stored privately under chat/ (signed links). */
  uploadAttachment: (id: string, file: File) => uploadFile(`${thread(id)}/attachments`, file),

  markRead: (id: string) => apiPost<void>(`${thread(id)}/read`),

  close: (id: string) => apiPost<SupportThread>(`${thread(id)}/close`),

  reopen: (id: string) => apiPost<SupportThread>(`${thread(id)}/reopen`),
};
