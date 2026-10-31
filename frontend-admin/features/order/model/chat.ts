/** Чат заказа: правила списка сообщений и черновик (без React). */
import { sessionStore } from "@shop/core/storage";
import type { OrderMessage } from "../api";

/** Новое сообщение в хвост, если такого id ещё нет (ответ POST и событие сокета приходят оба). */
export function appendMessage(prev: OrderMessage[] = [], msg: OrderMessage): OrderMessage[] {
  return prev.some((p) => p.id === msg.id) ? prev : [...prev, msg];
}

/** Сообщения покупателя помечены прочитанными (без копии списка, если нечего менять). */
export function markCustomerRead(prev: OrderMessage[] = [], nowIso: string): OrderMessage[] {
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

/** Старые страницы перед последней: без дублей с последней страницей. */
export function mergeOlder(latest: OrderMessage[], older: OrderMessage[]): OrderMessage[] {
  if (older.length === 0) return latest;
  const seen = new Set(latest.map((m) => m.id));
  return [...older.filter((m) => !seen.has(m.id)), ...latest];
}

export function unreadFromCustomer(messages: OrderMessage[] | undefined): number {
  return (messages ?? []).filter((m) => m.senderType === "CUSTOMER" && !m.readAt).length;
}

// ---- drafts -----------------------------------------------------------------
// The input used to live only in component state, so switching "Детали ↔ Чат" or closing the card
// threw the half-written reply away. Drafts are kept per order for the session.
const drafts = new Map<string, string>();
const draftKey = (orderId: string) => `tgshop_admin_chat_draft:${orderId}`;

export function loadDraft(orderId: string): string {
  if (drafts.has(orderId)) return drafts.get(orderId) ?? "";
  return sessionStore.getItem(draftKey(orderId)) ?? "";
}

/** Хранилище недоступно (приватный режим) — копия в памяти всё равно переживает переключение вкладок. */
export function saveDraft(orderId: string, text: string): void {
  drafts.set(orderId, text);
  if (text) sessionStore.setItem(draftKey(orderId), text);
  else sessionStore.removeItem(draftKey(orderId));
}
