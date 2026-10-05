/**
 * Support threads (V43): customer questions that are not about an order — about a product before
 * buying it, or a general one. Same message shape as the order chat, keyed by `threadId`.
 *
 *  Customer: /api/me/support/{config,unread-count,threads,threads/{id},threads/{id}/messages,
 *            threads/{id}/read,threads/{id}/close}; guests: GET /api/public/support/config
 *  Admin:    /api/admin/support/{unread-count,threads,threads/{id},threads/{id}/messages,
 *            threads/{id}/attachments,threads/{id}/read,threads/{id}/close,threads/{id}/reopen}
 *  Realtime: STOMP /topic/support/{threadId} → SupportMessage
 */
import type { Message, MessageType, SenderType } from "./types";

export type SupportStatus = "OPEN" | "CLOSED";

export interface SupportThread {
  id: string;
  status: SupportStatus;
  subject?: string | null;
  /** Product the question is about (null = general question); a snapshot, survives renames. */
  productId?: string | null;
  productTitle?: string | null;
  productSlug?: string | null;
  /** Raw product image URL/key — render through the app's image helper. */
  productImageUrl?: string | null;
  /** MINIAPP | WEB */
  source?: string | null;
  lastMessageAt: string;
  lastSender?: SenderType | null;
  lastPreview?: string | null;
  /** What the viewer has not read: shop answers for the customer, customer messages for an admin. */
  unreadCount: number;
  /** Set while the customer waits for a shop answer. */
  awaitingSince?: string | null;
  createdAt: string;
  closedAt?: string | null;
  /** CUSTOMER | ADMIN | AUTO */
  closedBy?: string | null;
  userId?: number | null;
  customerName?: string | null;
}

export interface SupportMessage {
  id: number;
  threadId: string;
  senderType: SenderType;
  senderName?: string | null;
  type: MessageType;
  text?: string | null;
  /** Short-lived signed URL, like the order chat. */
  attachmentUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  replyToMessageId?: number | null;
  createdAt: string;
  readAt?: string | null;
}

export interface CreateSupportThreadRequest {
  productId?: string;
  subject?: string;
  text?: string;
  type?: MessageType;
  /** Key from POST /api/me/uploads (own uploads only). */
  attachmentUrl?: string;
  fileName?: string;
  mimeType?: string;
}

export interface SupportConfig {
  enabled: boolean;
  maxLength: number;
  cooldownSec: number;
  maxOpenThreads: number;
  maxMessagesPerHour: number;
}

/** Stable error codes of the support endpoints (ApiError.code). */
export type SupportErrorCode =
  | "SUPPORT_DISABLED"
  | "SUPPORT_COOLDOWN"
  | "SUPPORT_HOURLY_LIMIT"
  | "SUPPORT_TOO_MANY_THREADS"
  | "SUPPORT_TOO_LONG";

/** STOMP destination of a thread. */
export function supportTopic(threadId: string): string {
  return `/topic/support/${threadId}`;
}

/**
 * A support message in the order-chat `Message` shape, so the existing chat bubbles render it
 * unchanged (`orderId` carries the thread id).
 */
export function supportAsChatMessage(m: SupportMessage): Message {
  const { threadId, ...rest } = m;
  return { ...rest, orderId: threadId };
}
