/**
 * Money and dates for the website, bound to an explicit locale.
 *
 * Unlike the Mini App, nothing here reads module state: server components render several languages
 * concurrently, so the locale always comes from the route (server) or the I18n context (client,
 * via {@link useFmt}).
 */
import { dayLabel as sharedDayLabel, formatDate as sharedFormatDate, formatDayMonth as sharedFormatDayMonth, formatDateTime as sharedFormatDateTime, formatTime as sharedFormatTime } from "@shop/core/time";
import { type Locale, LOCALE_TAG } from "@shop/core/i18n";
import { money as sharedMoney } from "@shop/core/money";
import { makeT } from "@/i18n";

/**
 * Time is shown in the viewer's zone. The server renders in UTC and cannot know it, so the first
 * client pass (hydration) must print exactly what the server printed, or React throws #418 (a review
 * posted at 23:30 UTC read «27 жовтня» in the HTML and «28 жовтня» in a Kyiv browser). Hence
 * {@link useFmt} passes {@link SHOP_TIME_ZONE} until hydration is done and the viewer's zone (undefined)
 * afterwards. Business calendar dates (legal documents) stay pinned to it via makeFmt(locale, SHOP_TIME_ZONE).
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

/** `timeZone` undefined = the viewer's own zone; pass {@link SHOP_TIME_ZONE} for server render / calendar dates. */
export function makeFmt(locale: Locale, timeZone?: string): Fmt {
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
    date: (iso) => sharedFormatDate(iso, tag, timeZone),
    dayMonth: (iso) => sharedFormatDayMonth(iso, tag, timeZone),
    dateTime: (iso) => sharedFormatDateTime(iso, tag, timeZone),
    time: (iso) => sharedFormatTime(iso, tag, timeZone),
    dayLabel: (iso) => sharedDayLabel(iso, tag, labels),
  };
}

/** Percentage off for an old/new price pair, or 0 when there is no real discount. */
export function discountPercent(priceMinor: number, compareAtMinor?: number | null): number {
  if (!compareAtMinor || compareAtMinor <= priceMinor) return 0;
  return Math.round(((compareAtMinor - priceMinor) / compareAtMinor) * 100);
}
