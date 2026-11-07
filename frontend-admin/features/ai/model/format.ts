import { formatNumber, money, toMajor } from "@shop/core/money";
import { PERCENT_BASE, toPercent } from "@shop/core/percent";

/**
 * Деньги ИИ. На сервере: расход — микродоллары (1 цент = 10 000), лимиты в настройках — центы, суммы в гривнах —
 * копейки (по курсу, который сервер запомнил). Показ гривен — через `core/money`, своих форматов гривны здесь нет.
 */
export const MICRO_PER_CENT = 10_000;
const CENTS_PER_DOLLAR = 100; // центов в долларе совпадает со счётом копеек в гривне: целая сумма — когда делится нацело

/** «$10» / «$1,25» из центов (так хранятся лимиты). */
export function usdFromCents(cents: number): string {
  const whole = cents % CENTS_PER_DOLLAR === 0;
  const text = formatNumber(toMajor(cents), "ru-RU", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `$${text}`;
}

/** Из микродолларов; доли цента скрыты, но «меньше цента» не превращается в «$0». */
export function usdFromMicro(micro: number): string {
  if (micro > 0 && micro < MICRO_PER_CENT) return "< $0,01";
  return usdFromCents(Math.round(micro / MICRO_PER_CENT));
}

export function uahFromMinor(minor: number): string {
  return money(minor);
}

/** Сколько потрачено из лимита, в процентах; 0 — лимита нет. */
export function usedPercent(spentMicro: number, limitMicro: number): number {
  if (limitMicro <= 0) return 0;
  return Math.min(PERCENT_BASE, Math.floor(toPercent(spentMicro / limitMicro)));
}

/** Гривны из центов по курсу в копейках за доллар (4200 = 42,00 ₴): подсказка у поля «Лимит» без запроса к серверу. */
export function uahFromCents(cents: number, rateKopecks: number): string {
  return money(Math.round(toMajor(cents * rateKopecks)));
}
