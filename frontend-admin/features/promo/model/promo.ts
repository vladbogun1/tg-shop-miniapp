import type { ManualDiscountOrder, PromoCode, PromoOrigin } from "./types";

export type StateFilter = "all" | "live" | "off";

/** База процента: 100 % = 1 (не деньги). */
const PERCENT = 100;

/** Доля `part` от `total`, целые %, не больше 100; `total` 0 — 0. */
export function ratioPercent(part: number, total: number): number {
  return total > 0 ? Math.min(PERCENT, Math.round((part / total) * PERCENT)) : 0;
}

/** `percent` % от суммы, вниз до копейки. */
export function percentOfMinor(amountMinor: number, percent: number): number {
  return Math.floor((amountMinor * percent) / PERCENT);
}

export const usesOf = (p: PromoCode) => p.usesCount ?? 0;

export const TABS: PromoOrigin[] = ["OURS", "PERSONAL", "REVIEW", "CASE"];
export const TAB_LABEL: Record<PromoOrigin, string> = { OURS: "Наши", PERSONAL: "Персональные скидки", REVIEW: "За отзывы", CASE: "Из кейса" };
/** Phones: the full labels do not fit 343 px in one row. */
export const TAB_LABEL_SHORT: Record<PromoOrigin, string> = { OURS: "Наши", PERSONAL: "Личные", REVIEW: "За отзывы", CASE: "Из кейса" };
export const TAB_EMPTY: Record<PromoOrigin, { title: string; text: string }> = {
  OURS: { title: "Своих промокодов пока нет", text: "Создайте промокод, чтобы предлагать клиентам скидки на заказы." },
  PERSONAL: {
    title: "Персональных скидок нет",
    text: "Здесь появятся коды для одного клиента и ручные скидки, которые вы дали в заказах.",
  },
  REVIEW: { title: "Бонусов за отзывы нет", text: "Код выдаётся автоматически, когда клиент оставляет отзыв о заказе." },
  CASE: { title: "Призов из кейса пока нет", text: "Здесь появятся промокоды, которые клиенты получили призом в кейсе подарка." },
};

/** Откуда код: поле бэкенда (`PromoOrigin`); фронт и бэкенд выкатываются вместе, старого бэкенда нет. */
export function promoOrigin(p: Pick<PromoCode, "origin">): PromoOrigin {
  return p.origin;
}

/** Can a customer still use it right now? */
export function isLive(p: PromoCode, now: number): boolean {
  if (!p.active) return false;
  if (p.expiresAt && new Date(p.expiresAt).getTime() < now) return false;
  return !(p.maxUses && usesOf(p) >= p.maxUses);
}

export function groupByTab(promos: PromoCode[]): Record<PromoOrigin, PromoCode[]> {
  const m: Record<PromoOrigin, PromoCode[]> = { OURS: [], PERSONAL: [], REVIEW: [], CASE: [] };
  for (const p of promos) m[promoOrigin(p)].push(p);
  return m;
}

/** Поиск по коду или Telegram id владельца + фильтр по состоянию внутри вкладки. */
export function filterCodes(list: PromoCode[], query: string, state: StateFilter, now: number): PromoCode[] {
  const needle = query.trim().toLowerCase();
  return list.filter((p) => {
    if (needle && !p.code.toLowerCase().includes(needle) && !String(p.ownerUserId ?? "").includes(needle)) return false;
    if (state === "live") return isLive(p, now);
    if (state === "off") return !isLive(p, now);
    return true;
  });
}

/**
 * Ручные скидки видны только во вкладке «Персональные»; у них нет своего состояния —
 * фильтр «Не действуют» их скрывает.
 */
export function filterManual(manual: ManualDiscountOrder[], tab: PromoOrigin, query: string, state: StateFilter): ManualDiscountOrder[] {
  if (tab !== "PERSONAL" || state === "off") return [];
  const needle = query.trim().toLowerCase();
  return manual.filter(
    (o) =>
      !needle ||
      (o.customerName ?? "").toLowerCase().includes(needle) ||
      o.label.toLowerCase().includes(needle) ||
      o.id.toLowerCase().startsWith(needle) ||
      String(o.tgUserId ?? "").includes(needle)
  );
}

/** Из адреса `?tab=personal|review|case`; чужое значение — `null`. */
export function tabFromSearch(search: string): PromoOrigin | null {
  const t = new URLSearchParams(search).get("tab")?.toUpperCase() as PromoOrigin | undefined;
  return t && TABS.includes(t) ? t : null;
}

export function tabSearch(tab: PromoOrigin): string {
  return tab === "OURS" ? "" : `?tab=${tab.toLowerCase()}`;
}

/** Срок «скоро истекает» для плашки-сводки: 7 суток. */
const EXPIRING_MS = 7 * 24 * 3600_000;

export interface PromoSummary {
  live: number;
  reserved: number;
  expiring: number;
  /** Включены, но не действуют: лимит исчерпан или срок прошёл. */
  stopped: number;
}

/** Плашка «Действуют / Включены, но не действуют / Резерв / Истекают» над списком вкладки. */
export function summaryOf(list: PromoCode[], now: number): PromoSummary {
  let live = 0;
  let reserved = 0;
  let expiring = 0;
  let stopped = 0;
  for (const p of list) {
    reserved += p.reservedCount ?? 0;
    if (!isLive(p, now)) {
      if (p.active) stopped++;
      continue;
    }
    live++;
    if (p.expiresAt) {
      const left = new Date(p.expiresAt).getTime() - now;
      if (left >= 0 && left <= EXPIRING_MS) expiring++;
    }
  }
  return { live, reserved, expiring, stopped };
}

export type MainStatus = "off" | "exhausted" | "expired" | "reserve" | "live";

/** Один главный статус строки по приоритету: выключен, исчерпан, истёк, слоты в резерве, действует. */
export function mainStatus(p: PromoCode, now: number): MainStatus {
  if (!p.active) return "off";
  const limited = !!p.maxUses;
  const used = usesOf(p);
  if (limited && used >= (p.maxUses ?? 0)) return "exhausted";
  if (p.expiresAt && new Date(p.expiresAt).getTime() < now) return "expired";
  if (limited && used + (p.reservedCount ?? 0) >= (p.maxUses ?? 0)) return "reserve";
  return "live";
}

/** Итоги заказов кода для панели: число, сумма скидки, сумма заказов (все статусы, как отдаёт сервер). */
export function orderTotals(rows: { discountMinor: number; totalMinor: number }[]) {
  return rows.reduce(
    (a: { count: number; discountMinor: number; totalMinor: number }, o) => ({ count: a.count + 1, discountMinor: a.discountMinor + o.discountMinor, totalMinor: a.totalMinor + o.totalMinor }),
    { count: 0, discountMinor: 0, totalMinor: 0 }
  );
}
