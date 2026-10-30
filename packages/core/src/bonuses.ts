/**
 * Review bonuses at checkout: which of my personal codes to offer next to the promo field.
 *
 * The code is not applied by itself — a single-use code may be worth more on a bigger order, so
 * the customer gets a one-tap offer instead. Codes do not stack, so only one is offered: the
 * largest discount, and of equal ones the one that runs out first.
 */
import type { Params } from "./i18n";
import { nowMs } from "./time";
import type { BonusCode } from "./types";

/** From this many days left the offer says the code is about to run out. */
export const BONUS_EXPIRING_DAYS = 7;

export interface BonusOffer {
  bonus: BonusCode;
  /** Days until the code expires, rounded up (1 = within a day); null for a code without an end date. */
  daysLeft: number | null;
  /** Other usable codes besides the offered one. */
  more: number;
}

function isUsable(b: BonusCode, now: number): boolean {
  if (b.state !== "ACTIVE") return false;
  if (!b.expiresAt) return true;
  const end = Date.parse(b.expiresAt);
  return Number.isNaN(end) || end > now;
}

function endOf(b: BonusCode): number {
  const end = b.expiresAt ? Date.parse(b.expiresAt) : NaN;
  return Number.isNaN(end) ? Number.POSITIVE_INFINITY : end;
}

/** The code to offer, or null when there is nothing usable. */
export function pickBonusOffer(bonuses: readonly BonusCode[] | null | undefined, now = nowMs()): BonusOffer | null {
  const usable = (bonuses ?? []).filter((b) => isUsable(b, now));
  if (usable.length === 0) return null;
  const best = [...usable].sort((a, b) => b.percent - a.percent || endOf(a) - endOf(b))[0];
  const end = endOf(best);
  const daysLeft = Number.isFinite(end) ? Math.max(1, Math.ceil((end - now) / 86_400_000)) : null;
  return { bonus: best, daysLeft, more: usable.length - 1 };
}

/** The ceiling of a bonus in kopecks ("−5% (до 100 ₴)", V63), or null when there is none. */
export function bonusCap(b: Pick<BonusCode, "maxDiscountMinor">): number | null {
  return b.maxDiscountMinor && b.maxDiscountMinor > 0 ? b.maxDiscountMinor : null;
}

/** "−5%" or "−5% (до 100 ₴)" with the app's own `reviews.bonus.percent` / `reviews.bonus.percentCapped`. */
export function reviewBonusText(
  b: Pick<BonusCode, "percent" | "maxDiscountMinor">,
  t: (key: "reviews.bonus.percent" | "reviews.bonus.percentCapped", params: Params) => string,
  money: (minor: number) => string
): string {
  const max = bonusCap(b);
  return max != null
    ? t("reviews.bonus.percentCapped", { n: b.percent, max: money(max) })
    : t("reviews.bonus.percent", { n: b.percent });
}

/** The promo source of a gift-case prize code (GiftService.PROMO_SOURCE). */
export const CASE_PROMO_SOURCE = "GIFT_CASE";

/** A case prize code rather than a review bonus. */
export function isCaseBonus(b: Pick<BonusCode, "source">): boolean {
  return b.source === CASE_PROMO_SOURCE;
}

/** My personal code by its text, or null. */
export function findBonus(code: string, bonuses: readonly BonusCode[] | null | undefined): BonusCode | null {
  const c = code.trim().toUpperCase();
  return c.length > 0 ? (bonuses ?? []).find((b) => b.code.toUpperCase() === c) ?? null : null;
}

/** Which of my codes this is — the field says so instead of a bare discount. */
export function bonusKind(code: string, bonuses: readonly BonusCode[] | null | undefined): "review" | "case" | null {
  const b = findBonus(code, bonuses);
  return b ? (isCaseBonus(b) ? "case" : "review") : null;
}

/** Is this code one of my review bonuses (the field then says so instead of a bare discount)? */
export function isBonusCode(code: string, bonuses: readonly BonusCode[] | null | undefined): boolean {
  const c = code.trim().toUpperCase();
  return c.length > 0 && (bonuses ?? []).some((b) => b.code.toUpperCase() === c);
}
