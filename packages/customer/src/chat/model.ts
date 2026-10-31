/**
 * Чистая модель чат-ленты (чат заказа и чат поддержки одинаковы): страница истории, дедупликация сообщений,
 * подгрузка старых, группировка по календарным дням. Без React — проверяется тестом.
 */
import { dayKey } from "@shop/core/time";

/** Должно совпадать с MessageService.DEFAULT_PAGE / SupportService на бэкенде. */
export const CHAT_PAGE_SIZE = 50;

export interface ChatItem {
  id: number;
  createdAt: string;
}

/** Полная страница = дальше, вероятно, есть история. */
export function hasMoreHistory(pageLength: number): boolean {
  return pageLength >= CHAT_PAGE_SIZE;
}

/** Первое появление id → true и запоминаем; повтор (ответ POST и событие ws приходят оба) → false. */
export function markSeen(seen: Set<number>, id: number): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  return true;
}

/** Старые сообщения без уже показанных; `seen` пополняется. Порядок страницы сохраняется (старые сверху). */
export function freshOlder<M extends ChatItem>(older: M[], seen: Set<number>): M[] {
  const fresh = older.filter((m) => !seen.has(m.id));
  fresh.forEach((m) => seen.add(m.id));
  return fresh;
}

export interface ChatDay<M> {
  key: string;
  label: string;
  msgs: M[];
}

/**
 * Группы по календарному дню зрителя (часовой пояс браузера), как в Telegram: плашка даты липнет к верху.
 * Группируем по самому дню, а не по подписи: строки с одинаковой подписью разных лет склеивались бы и
 * вели себя по-разному на трёх языках.
 */
export function groupByDay<M extends ChatItem>(messages: M[], label: (iso: string) => string): ChatDay<M>[] {
  const out: ChatDay<M>[] = [];
  for (const m of messages) {
    const key = dayKey(m.createdAt);
    const last = out[out.length - 1];
    if (last && last.key === key) last.msgs.push(m);
    else out.push({ key, label: label(m.createdAt), msgs: [m] });
  }
  return out;
}

export function indexById<M extends ChatItem>(messages: M[]): Map<number, M> {
  const map = new Map<number, M>();
  messages.forEach((m) => map.set(m.id, m));
  return map;
}

/** Есть непрочитанное сообщение от магазина → пора отметить прочитанным. */
export function hasUnreadFromShop(messages: { senderType: string; readAt?: string | null }[]): boolean {
  return messages.some((m) => m.senderType === "ADMIN" && !m.readAt);
}
