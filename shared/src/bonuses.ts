/**
 * Review bonuses at checkout: which of my personal codes to offer next to the promo field.
 *
 * The code is not applied by itself — a single-use code may be worth more on a bigger order, so
 * the customer gets a one-tap offer instead. Codes do not stack, so only one is offered: the
 * largest discount, and of equal ones the one that runs out first.
 */
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
export function pickBonusOffer(bonuses: readonly BonusCode[] | null | undefined, now = Date.now()): BonusOffer | null {
  const usable = (bonuses ?? []).filter((b) => isUsable(b, now));
  if (usable.length === 0) return null;
  const best = [...usable].sort((a, b) => b.percent - a.percent || endOf(a) - endOf(b))[0];
  const end = endOf(best);
  const daysLeft = Number.isFinite(end) ? Math.max(1, Math.ceil((end - now) / 86_400_000)) : null;
  return { bonus: best, daysLeft, more: usable.length - 1 };
}

/** Is this code one of my review bonuses (the field then says so instead of a bare discount)? */
export function isBonusCode(code: string, bonuses: readonly BonusCode[] | null | undefined): boolean {
  const c = code.trim().toUpperCase();
  return c.length > 0 && (bonuses ?? []).some((b) => b.code.toUpperCase() === c);
}
