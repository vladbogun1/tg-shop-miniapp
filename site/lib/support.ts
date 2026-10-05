"use client";

/**
 * Support threads (V43) for the website: questions that are not about an order — about a product
 * before buying it, or a general one. Endpoints, realtime and small hooks live here so the shared
 * `lib/api.ts` stays untouched; the HTTP client is configured exactly like the one there (same
 * origin, HttpOnly cookie, Accept-Language, refresh-once on 401/403).
 *
 * Errors: a refusal is a 400 with `code` (SUPPORT_COOLDOWN, SUPPORT_HOURLY_LIMIT, …) and a message
 * the server already localized by Accept-Language — {@link supportErrorText} shows it as is.
 */
import { useQuery } from "@tanstack/react-query";
import {
  connectOrderChat as connect,
  createHttpClient,
  supportAsChatMessage,
  supportTopic,
  type ChatConnection,
  type CreateSupportThreadRequest,
  type Message,
  type SendMessageRequest,
  type SupportConfig,
  type SupportMessage,
  type SupportThread,
} from "@shop/shared";
import { makeT, type TFunction } from "@/i18n";
import { getActiveLocale, getActiveTag } from "@/i18n/active";
import { ApiError, isAuthFailure, refreshSession } from "./api";
import { useSession } from "./session";

const http = createHttpClient({
  baseUrl: "",
  getToken: () => null,
  credentials: "include",
  getLocale: getActiveTag,
  messages: {
    offline: () => makeT(getActiveLocale())("common.offline"),
    unauthorized: () => makeT(getActiveLocale())("common.sessionExpired"),
    http: (status) => makeT(getActiveLocale())("common.httpError", { status }),
  },
});

/** Same as `authed` in lib/api: on 401/403 refresh the session once and repeat. */
async function authed<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (!isAuthFailure(e)) throw e;
    await refreshSession();
    return call();
  }
}

/** Must match the backend's support message page size. */
export const SUPPORT_PAGE_SIZE = 50;

export const supportApi = {
  /** No auth: whether support is on and its limits (entry points hide when `enabled` is false). */
  publicConfig: () => http.get<SupportConfig>("/api/public/support/config"),
  config: () => authed(() => http.get<SupportConfig>("/api/me/support/config")),
  unreadCount: () => authed(() => http.get<{ count: number }>("/api/me/support/unread-count")),
  threads: () => authed(() => http.get<SupportThread[]>("/api/me/support/threads")),
  /** With `productId`: an OPEN thread about that product gets the message appended and is returned. */
  create: (body: CreateSupportThreadRequest) =>
    authed(() => http.post<SupportThread>("/api/me/support/threads", body)),
  thread: (id: string) => authed(() => http.get<SupportThread>(`/api/me/support/threads/${id}`)),
  /** Oldest-first page; `before` = id of the oldest message already shown. */
  messages: (id: string, before?: number) =>
    authed(() =>
      http.get<SupportMessage[]>(
        `/api/me/support/threads/${id}/messages?limit=${SUPPORT_PAGE_SIZE}${before ? `&before=${before}` : ""}`
      )
    ),
  /** Writing into a CLOSED thread reopens it. */
  send: (id: string, body: SendMessageRequest) =>
    authed(() => http.post<SupportMessage>(`/api/me/support/threads/${id}/messages`, body)),
  markRead: (id: string) => authed(() => http.post<void>(`/api/me/support/threads/${id}/read`)),
  close: (id: string) => authed(() => http.post<SupportThread>(`/api/me/support/threads/${id}/close`)),
  /** Same upload endpoint as the order chat; returns the object key to send as `attachmentUrl`. */
  upload: (file: File) => authed(() => http.upload<{ url: string }>("/api/me/uploads", file)),
};

/** Query keys. Everything under ["me"] is dropped on logout (see useLogout). */
export const SUPPORT_KEYS = {
  config: ["support", "config"] as const,
  all: ["me", "support"] as const,
  unread: ["me", "support", "unread"] as const,
  threads: ["me", "support", "threads"] as const,
  thread: (id: string) => ["me", "support", "thread", id] as const,
  messages: (id: string) => ["me", "support", "thread", id, "messages"] as const,
};

/** Defaults when the config has not arrived yet (match the backend defaults). */
export const SUPPORT_DEFAULTS: SupportConfig = {
  enabled: true,
  maxLength: 2000,
  cooldownSec: 10,
  maxOpenThreads: 3,
  maxMessagesPerHour: 30,
};

/** Public support config; `enabled` stays undefined until it is known (entry points stay hidden). */
export function useSupportConfig() {
  const q = useQuery({
    queryKey: SUPPORT_KEYS.config,
    queryFn: () => supportApi.publicConfig(),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return { config: q.data, enabled: q.data?.enabled === true, isLoading: q.isPending };
}

/** Unread shop answers over all my threads (0 for guests or when support is off). */
export function useSupportUnread(): number {
  const { status } = useSession();
  const { enabled } = useSupportConfig();
  const q = useQuery({
    queryKey: SUPPORT_KEYS.unread,
    queryFn: () => supportApi.unreadCount(),
    enabled: status === "authed" && enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  return status === "authed" && enabled ? q.data?.count ?? 0 : 0;
}

/** The server's (already localized) refusal text, or a generic fallback. */
export function supportErrorText(e: unknown, t: TFunction, fallback: Parameters<TFunction>[0] = "support.error.generic"): string {
  if (e instanceof ApiError && e.message && (e.status === 400 || e.status === 409 || e.status === 429)) return e.message;
  return t(fallback);
}

/** A support message (realtime or REST) in the order-chat shape the bubbles render. */
export function toChatMessage(m: SupportMessage | Message): Message {
  return "threadId" in m ? supportAsChatMessage(m) : m;
}

/**
 * Realtime for one thread: the shared STOMP client in cookie mode (like lib/ws.ts for the order
 * chat), subscribed to `/topic/support/{threadId}`.
 */
export function connectSupportChat(
  threadId: string,
  onMessage: (msg: Message) => void,
  onStatus?: (connected: boolean) => void
): ChatConnection {
  return connect({
    baseUrl: process.env.NEXT_PUBLIC_WS_ORIGIN ?? "",
    orderId: threadId,
    topic: supportTopic(threadId),
    getToken: () => null,
    cookieAuth: true,
    onMessage: (raw) => onMessage(toChatMessage(raw as Message | SupportMessage)),
    onStatus,
  });
}
