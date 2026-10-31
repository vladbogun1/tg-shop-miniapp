import type { ManualDiscountOrder, PromoCode, PromoOrigin } from "./types";

export type StateFilter = "all" | "live" | "off";

export const usesOf = (p: PromoCode) => p.usesCount ?? 0;

export const TABS: PromoOrigin[] = ["OURS", "PERSONAL", "REVIEW"];
export const TAB_LABEL: Record<PromoOrigin, string> = { OURS: "Наши", PERSONAL: "Персональные скидки", REVIEW: "За отзывы" };
/** Phones: the full labels do not fit 343 px in one row. */
export const TAB_LABEL_SHORT: Record<PromoOrigin, string> = { OURS: "Наши", PERSONAL: "Личные", REVIEW: "За отзывы" };
export const TAB_EMPTY: Record<PromoOrigin, { title: string; text: string }> = {
  OURS: { title: "Своих промокодов пока нет", text: "Создайте промокод, чтобы предлагать клиентам скидки на заказы." },
  PERSONAL: {
    title: "Персональных скидок нет",
    text: "Здесь появятся коды для одного клиента и ручные скидки, которые вы дали в заказах.",
  },
  REVIEW: { title: "Бонусов за отзывы нет", text: "Код выдаётся автоматически, когда клиент оставляет отзыв о заказе." },
};

/** Откуда код: поле бэкенда, а для старого бэкенда — по владельцу и источнику. */
export function promoOrigin(p: PromoCode): PromoOrigin {
  if (p.origin) return p.origin;
  if (p.source === "REVIEW_BONUS") return "REVIEW";
  return p.ownerUserId != null || p.source ? "PERSONAL" : "OURS";
}

/** Can a customer still use it right now? */
export function isLive(p: PromoCode, now: number): boolean {
  if (!p.active) return false;
  if (p.expiresAt && new Date(p.expiresAt).getTime() < now) return false;
  return !(p.maxUses && usesOf(p) >= p.maxUses);
}

export function groupByTab(promos: PromoCode[]): Record<PromoOrigin, PromoCode[]> {
  const m: Record<PromoOrigin, PromoCode[]> = { OURS: [], PERSONAL: [], REVIEW: [] };
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

/** Из адреса `?tab=personal|review`; чужое значение — `null`. */
export function tabFromSearch(search: string): PromoOrigin | null {
  const t = new URLSearchParams(search).get("tab")?.toUpperCase() as PromoOrigin | undefined;
  return t && TABS.includes(t) ? t : null;
}

export function tabSearch(tab: PromoOrigin): string {
  return tab === "OURS" ? "" : `?tab=${tab.toLowerCase()}`;
}
