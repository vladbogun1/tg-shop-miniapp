import type { Schemas } from "@shop/core/api/schemas";

/** Kinds the UI knows (icon, colour, main action). The server may add more — see `knownType`. */
export const INBOX_TYPES = [
  "PAYMENT",
  /** APPROVED, but the online prepayment / payment never arrived. */
  "APPROVED_UNPAID",
  "CHAT",
  "NEW_STALE",
  "APPROVED_STALE",
  "RETURN",
  "LOW_STOCK",
  "SITE_ERROR",
  "REVIEW",
  /** Support question waiting for an answer: entityId = thread id, no orderId. */
  "SUPPORT",
] as const;
export type KnownInboxType = (typeof INBOX_TYPES)[number];
/** A kind from the server: one of the known ones, or a newer one rendered with its own title. */
export type InboxType = KnownInboxType | (string & {});

/**
 * Строки «Внимания» — ответ `GET /api/admin/inbox` из OpenAPI; поверх него только уточнён `type`/`id`
 * (известные виды + новые от сервера). Необязательные поля сервер шлёт как null (у сгенерированных типов они без `| null`),
 * поэтому экран проверяет их на «пусто».
 */
export type InboxItem = Omit<Schemas["InboxItem"], "type"> & { type: InboxType };
export type InboxGroup = Omit<Schemas["InboxGroup"], "id" | "items"> & { id: InboxType; items: InboxItem[] };
export type Inbox = Omit<Schemas["Inbox"], "groups"> & { groups: InboxGroup[] };

export type SnoozePreset = "HOUR" | "TOMORROW" | "DAYS3";

export const SNOOZE_OPTIONS: { value: SnoozePreset; label: string }[] = [
  { value: "HOUR", label: "На 1 час" },
  { value: "TOMORROW", label: "До завтра 9:00" },
  { value: "DAYS3", label: "На 3 дня" },
];
