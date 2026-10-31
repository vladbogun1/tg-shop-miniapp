import type { SupportMessage } from "./types";

/** Page size of the thread chat (the backend default). */
export const SUPPORT_CHAT_PAGE = 50;

/** Сообщения клиента помечены прочитанными (кэш чата после POST /read). */
export function markCustomerRead(prev: SupportMessage[] = [], nowIso: string): SupportMessage[] {
  let changed = false;
  const next = prev.map((m) => {
    if (m.senderType === "CUSTOMER" && !m.readAt) {
      changed = true;
      return { ...m, readAt: nowIso };
    }
    return m;
  });
  return changed ? next : prev;
}

export function appendUnique(prev: SupportMessage[] = [], msg: SupportMessage): SupportMessage[] {
  return prev.some((p) => p.id === msg.id) ? prev : [...prev, msg];
}

/** Старые страницы + последняя; повторы по id отбрасываются (побеждает последняя страница). */
export function mergeMessages(older: SupportMessage[], latest: SupportMessage[]): SupportMessage[] {
  if (older.length === 0) return latest;
  const seen = new Set(latest.map((m) => m.id));
  return [...older.filter((m) => !seen.has(m.id)), ...latest];
}

/** Есть смысл просить «Загрузить ранее»: последняя страница полная и старые ещё не кончились. */
export function canLoadOlder(latestCount: number, exhausted: boolean): boolean {
  return !exhausted && latestCount >= SUPPORT_CHAT_PAGE;
}
