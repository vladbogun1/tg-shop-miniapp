import type { SupportFilter } from "./model/types";

const ROOT = ["admin", "support"] as const;

/** Позиция слова "messages" в ключе чата: обновление списка/бейджа не должно перезагружать открытый чат. */
export const MESSAGES_SEGMENT = 2;

/** Ключи кэша фичи. */
export const supportKeys = {
  all: () => ROOT,
  unread: () => [...ROOT, "unread"] as const,
  threads: (filter: SupportFilter, q: string) => [...ROOT, "threads", filter, q] as const,
  thread: (id: string | null) => [...ROOT, "thread", id] as const,
  messages: (id: string) => [...ROOT, "messages", id] as const,
};
