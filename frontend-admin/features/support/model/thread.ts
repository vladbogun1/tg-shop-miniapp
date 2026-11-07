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

/** Пороги срочности ожидания ответа: дольше получаса — внимание, дольше двух часов — срочно. */
export const WAIT_WARN_MIN = 30;
export const WAIT_DANGER_MIN = 120;

export type Urgency = "calm" | "warn" | "danger";

/** Сколько минут клиент ждёт ответа; null — не ждёт. */
export function waitingMinutes(thread: SupportThread, nowMs: number): number | null {
  if (!isWaiting(thread) || !thread.awaitingSince) return null;
  return Math.max(0, Math.floor((nowMs - new Date(thread.awaitingSince).getTime()) / 60_000));
}

export function urgencyOf(minutes: number | null): Urgency {
  if (minutes == null || minutes < WAIT_WARN_MIN) return "calm";
  return minutes < WAIT_DANGER_MIN ? "warn" : "danger";
}

/** «ждёт 2 ч 40 мин» / «ждёт 12 мин» / «ждёт 3 д 4 ч». */
export function waitingLabel(minutes: number): string {
  if (minutes < 1) return "ждёт меньше минуты";
  if (minutes < 60) return `ждёт ${minutes} мин`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `ждёт ${h} ч${minutes % 60 ? ` ${minutes % 60} мин` : ""}`;
  const d = Math.floor(h / 24);
  return `ждёт ${d} д${h % 24 ? ` ${h % 24} ч` : ""}`;
}

/** Очередь «Ждут ответа»: дольше всех ждущие — сверху (остальные фильтры — по последней активности, как отдаёт сервер). */
export function sortForFilter(threads: SupportThread[], filter: SupportFilter): SupportThread[] {
  if (filter !== "awaiting") return threads;
  const at = (t: SupportThread) => (t.awaitingSince ? new Date(t.awaitingSince).getTime() : Number.MAX_SAFE_INTEGER);
  return [...threads].sort((a, b) => at(a) - at(b));
}

/** Alt+↓ / Alt+↑: соседний вопрос списка; без открытого — первый (вниз) или последний (вверх); на краю остаёмся на месте. */
export function neighbourThreadId(ids: string[], current: string | null, dir: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const i = current ? ids.indexOf(current) : -1;
  if (i < 0) return dir === 1 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, i + dir))];
}
