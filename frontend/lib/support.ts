"use client";

/**
 * Support threads — questions to the shop that are not about an order (V43).
 * Endpoints: /api/me/support/** (see shared/src/support.ts); attachments go through the order-chat
 * upload (POST /api/me/uploads). Realtime: STOMP /topic/support/{threadId}.
 */
import { connectOrderChat as connect, type ChatConnection } from "@shop/core/ws";
import { supportTopic, type CreateSupportThreadRequest, type SupportConfig, type SupportMessage, type SupportThread } from "@shop/core/support";
import { noAuthRetry } from "@shop/customer/order/api";
import { createSupportApi } from "@shop/customer/support/api";
import { parseSupportDeepLink } from "@shop/customer/support/model";
import { apiGet, apiPost, apiUpload, getAccessToken, getApiBase } from "@/lib/api";

export type { CreateSupportThreadRequest, SupportConfig, SupportMessage, SupportThread };

/** Пути поддержки — @shop/customer/support; токен в памяти, повтор после обновления сессии не нужен. */
export const supportApi = createSupportApi({ get: apiGet, post: apiPost, upload: apiUpload }, noAuthRetry);

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

export { parseSupportDeepLink };
