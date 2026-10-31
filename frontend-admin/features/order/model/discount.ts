/** Скидка на заказ: какие промокоды предлагаем и что получится в итоге (то же, что считает сервер). */
import { toMinor } from "@/lib/money";
import { promoOrigin, type PromoCode as PromoCodeFull } from "@/features/promo";

export type DiscountMode = "promo" | "manual";
export type DiscountKind = "amount" | "percent";

/**
 * Exhausted / expired codes would only fail on the server ("лимит исчерпан") — not offered.
 * Offered: our shared codes, then this customer's own personal codes (e.g. their review bonus).
 * Other customers' personal codes and review bonuses would be refused anyway («чужой код»).
 */
export function usablePromos(promos: PromoCodeFull[], ownerId: number | null | undefined, now: number): PromoCodeFull[] {
  const usable = promos.filter(
    (p) =>
      p.active &&
      (p.maxUses == null || (p.usesCount ?? 0) < p.maxUses) &&
      !(p.expiresAt && new Date(p.expiresAt).getTime() < now)
  );
  const ours = usable.filter((p) => promoOrigin(p) === "OURS");
  const own = usable.filter((p) => promoOrigin(p) !== "OURS" && p.ownerUserId != null && p.ownerUserId === ownerId);
  return [...ours, ...own];
}

/** Число из поля ввода («7,5» → 7.5); мусор — 0. */
export function parseNumberInput(val: string): number {
  return parseFloat(val.replace(",", ".")) || 0;
}

/** Копейки из введённой суммы (без отсечения «Infinity»: как было). */
export function minorFromInput(num: number): number {
  return Number.isFinite(num) ? toMinor(num) : num;
}

/** Целое число процентов = «100 %». */
const FULL_PERCENT = 100;

/** Доля `percent` % от суммы в копейках, округление вниз (как считает сервер). Не деньги → деньги: на входе проценты. */
export function percentOfMinor(minor: number, percent: number): number {
  return Math.floor((minor * percent) / FULL_PERCENT);
}

/** The backend takes a whole percent — preview exactly what will be saved (7,5 → 8). */
export function wholePercent(num: number): number {
  return Math.min(Math.round(num), 100);
}

export function promoDiscountMinor(p: PromoCodeFull, subtotal: number): number {
  return (p.discountAmountMinor ?? 0) > 0
    ? Math.min(p.discountAmountMinor!, subtotal)
    : Math.min(
        percentOfMinor(subtotal, p.discountPercent ?? 0),
        (p.maxDiscountMinor ?? 0) > 0 ? p.maxDiscountMinor! : Number.POSITIVE_INFINITY
      );
}

export function manualDiscountMinor(kind: DiscountKind, num: number, pct: number, subtotal: number): number {
  if (kind === "amount") return Math.min(minorFromInput(num), subtotal);
  return percentOfMinor(subtotal, pct);
}

export function canApplyDiscount(mode: DiscountMode, kind: DiscountKind, promoCode: string, num: number, pct: number): boolean {
  return (mode === "promo" && !!promoCode) || (mode === "manual" && (kind === "amount" ? num > 0 : pct > 0));
}
