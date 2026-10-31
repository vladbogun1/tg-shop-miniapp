import type { SupportFilter, SupportThread } from "./types";

const CLOSED_BY: Record<string, string> = {
  CUSTOMER: "клиентом",
  ADMIN: "админом",
  AUTO: "автоматически",
};

export const EMPTY_HINT: Record<SupportFilter, string> = {
  awaiting: "Все вопросы отвечены.",
  open: "Открытых вопросов нет. Новые появятся здесь сами.",
  closed: "Закрытых вопросов пока нет.",
  all: "Покупатели ещё ничего не спрашивали.",
};

/** «Закрыт клиентом» / «Закрыт»; null — вопрос открыт. */
export function closedLabel(thread: SupportThread): string | null {
  if (thread.status === "OPEN") return null;
  const by = thread.closedBy ? CLOSED_BY[thread.closedBy] : null;
  return by ? `Закрыт ${by}` : "Закрыт";
}

/** Открыт и клиент ждёт ответа магазина. */
export function isWaiting(thread: SupportThread): boolean {
  return thread.status === "OPEN" && !!thread.awaitingSince;
}

export function threadTopic(thread: SupportThread): string {
  return thread.productTitle || thread.subject || "Общий вопрос";
}

export function customerOf(thread: SupportThread): string {
  return thread.customerName?.trim() || (thread.userId ? `#${thread.userId}` : "Клиент");
}

/** «Mini App» / «Сайт» — where the customer asked. */
export function sourceLabel(source?: string | null): string {
  return source === "WEB" ? "Сайт" : "Mini App";
}

/** Public product page on the site (Ukrainian is the main locale). */
export const SITE_BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://chisetup.com.ua").replace(/\/$/, "");

export function siteProductUrl(slug: string): string {
  return `${SITE_BASE_URL}/uk/product/${encodeURIComponent(slug)}`;
}

/** Счётчик на чипе «Ждут ответа»: ноль не показываем. */
export function awaitingCount(unread: { count: number } | undefined): number | undefined {
  const n = unread?.count ?? 0;
  return n > 0 ? n : undefined;
}

/** Ссылка `/support?thread=<id>` без параметра thread (остальные сохраняются). */
export function searchWithoutThread(search: string): string {
  const sp = new URLSearchParams(search);
  sp.delete("thread");
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}
