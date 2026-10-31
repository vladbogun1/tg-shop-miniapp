/**
 * Ключи кэша, значения по умолчанию и разбор deep-link поддержки — значения не менять: те же ключи
 * сбрасываются при выходе (всё под ["me"]) и читаются экранами обоих приложений.
 */
import type { SupportConfig } from "@shop/core/support";

export const SUPPORT_KEYS = {
  config: ["support", "config"] as const,
  all: ["me", "support"] as const,
  unread: ["me", "support", "unread"] as const,
  threads: ["me", "support", "threads"] as const,
  thread: (id: string) => ["me", "support", "thread", id] as const,
  messages: (id: string) => ["me", "support", "thread", id, "messages"] as const,
};

/** Пока конфиг не пришёл (совпадает с умолчаниями бэкенда). */
export const SUPPORT_DEFAULTS: SupportConfig = {
  enabled: true,
  maxLength: 2000,
  cooldownSec: 10,
  maxOpenThreads: 3,
  maxMessagesPerHour: 30,
};

/** Явный размер страницы истории поддержки на сайте; совпадает с бэкендом. */
export const SUPPORT_PAGE_SIZE = 50;

/** Deep link `support_<threadId>` из кнопки бота «поддержка ответила». */
export function parseSupportDeepLink(param: string | null): string | null {
  if (!param) return null;
  const m = /^support[_-](.+)$/.exec(param);
  return m ? (m[1] ?? null) : null;
}
