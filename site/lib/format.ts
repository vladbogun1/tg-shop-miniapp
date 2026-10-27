/**
 * Money and dates for the website, bound to an explicit locale.
 *
 * Unlike the Mini App, nothing here reads module state: server components render several languages
 * concurrently, so the locale always comes from the route (server) or the I18n context (client,
 * via {@link useFmt}).
 */
import {
  dayLabel as sharedDayLabel,
  formatDate as sharedFormatDate,
  formatDayMonth as sharedFormatDayMonth,
  formatDateTime as sharedFormatDateTime,
  formatTime as sharedFormatTime,
  type Locale,
  LOCALE_TAG,
  money as sharedMoney,
} from "@shop/shared";
import { makeT } from "@/i18n";

/**
 * Dates print in the shop's zone, not the runtime's: the server renders in UTC and the browser
 * hydrates in the visitor's zone, so a review posted at 23:30 UTC read «27 жовтня» in the HTML and
 * «28 жовтня» in a Kyiv browser — React error #418 on the home page (reviews ribbon).
 */
export const SHOP_TIME_ZONE = "Europe/Kyiv";

export interface Fmt {
  money: (minor: number | null | undefined, currency?: string) => string;
  date: (iso: string) => string;
  /** "10 окт." — no year, for tight spots. */
  dayMonth: (iso: string) => string;
  dateTime: (iso: string) => string;
  time: (iso: string) => string;
  dayLabel: (iso: string) => string;
}

export function makeFmt(locale: Locale): Fmt {
  const tag = LOCALE_TAG[locale];
  const t = makeT(locale);
  const labels = {
    today: t("time.today"),
    yesterday: t("time.yesterday"),
    justNow: t("time.justNow"),
    minutes: t("time.minutes"),
    hours: t("time.hours"),
  };
  return {
    money: (minor, currency = "UAH") => sharedMoney(minor, currency, tag),
    date: (iso) => sharedFormatDate(iso, tag, SHOP_TIME_ZONE),
    dayMonth: (iso) => sharedFormatDayMonth(iso, tag, SHOP_TIME_ZONE),
    dateTime: (iso) => sharedFormatDateTime(iso, tag, SHOP_TIME_ZONE),
    time: (iso) => sharedFormatTime(iso, tag, SHOP_TIME_ZONE),
    dayLabel: (iso) => sharedDayLabel(iso, tag, labels),
  };
}

/** Percentage off for an old/new price pair, or 0 when there is no real discount. */
export function discountPercent(priceMinor: number, compareAtMinor?: number | null): number {
  if (!compareAtMinor || compareAtMinor <= priceMinor) return 0;
  return Math.round(((compareAtMinor - priceMinor) / compareAtMinor) * 100);
}
