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
import { createHttpClient } from "@shop/core/http";
import { type CreateSupportThreadRequest, supportAsChatMessage, type SupportConfig, type SupportMessage, type SupportThread, supportTopic } from "@shop/core/support";
import { getActiveLocale, getActiveTag } from "@shop/core/i18n";
import { type Message, type SendMessageRequest } from "@shop/core/types";
import { createSupportApi } from "@shop/customer/support/api";
import { SUPPORT_DEFAULTS, SUPPORT_KEYS, SUPPORT_PAGE_SIZE } from "@shop/customer/support/model";
import { makeT, type TFunction } from "@/i18n";
import { ApiError, isAuthFailure, refreshSession } from "@/lib/api";
import { useSession } from "@/features/auth";
import { type ChatConnection, connectSupportThread } from "@/lib/ws";

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

export { SUPPORT_DEFAULTS, SUPPORT_KEYS, SUPPORT_PAGE_SIZE };

/** Пути поддержки — @shop/customer/support; история с явным limit (политика сайта). */
export const supportApi = createSupportApi(http, authed, { messagesLimit: SUPPORT_PAGE_SIZE });

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

/** Realtime for one thread: `/topic/support/{threadId}` over the shared cookie-mode STOMP client. */
export function connectSupportChat(
  threadId: string,
  onMessage: (msg: Message) => void,
  onStatus?: (connected: boolean) => void
): ChatConnection {
  return connectSupportThread(threadId, supportTopic(threadId), (raw) => onMessage(toChatMessage(raw as Message | SupportMessage)), onStatus);
}
