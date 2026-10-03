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
  formatDateTime as sharedFormatDateTime,
  formatTime as sharedFormatTime,
  money as sharedMoney,
} from "@shop/shared";
import { makeT } from "@/i18n";
import { LOCALE_TAG, type Locale } from "@/i18n/locales";

export interface Fmt {
  money: (minor: number | null | undefined, currency?: string) => string;
  date: (iso: string) => string;
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
    date: (iso) => sharedFormatDate(iso, tag),
    dateTime: (iso) => sharedFormatDateTime(iso, tag),
    time: (iso) => sharedFormatTime(iso, tag),
    dayLabel: (iso) => sharedDayLabel(iso, tag, labels),
  };
}

/** Percentage off for an old/new price pair, or 0 when there is no real discount. */
export function discountPercent(priceMinor: number, compareAtMinor?: number | null): number {
  if (!compareAtMinor || compareAtMinor <= priceMinor) return 0;
  return Math.round(((compareAtMinor - priceMinor) / compareAtMinor) * 100);
}

export { shortOrderId, ORDER_STATUS_COLOR, ORDER_TIMELINE } from "@shop/shared";
