/**
 * Date/status helpers for the customer app.
 *
 * The implementations live in `@shop/shared` so the admin cannot drift; this file only binds them
 * to the language currently on screen. Call sites keep the same signatures they always had.
 */
import {
  dayLabel as sharedDayLabel,
  formatDate as sharedFormatDate,
  formatShortDateTime as sharedFormatDateTime,
  formatTime as sharedFormatTime,
  timeAgo as sharedTimeAgo,
} from "@shop/shared";
import { getActiveLocale, getActiveTag } from "@/i18n/active";
import { ru } from "@/i18n/ru";
import { uk } from "@/i18n/uk";
import { en } from "@/i18n/en";
import type { Locale } from "@/i18n/locales";
import type { Dictionary } from "@/i18n/types";

export {
  ORDER_STATUS_COLOR,
  ORDER_TIMELINE,
  shortOrderId,
} from "@shop/shared";

const DICTIONARIES: Record<Locale, Dictionary> = { ru, uk, en };

/** "Сегодня" / "Вчора" / "just now" — words, so they come from the dictionary, not from Intl. */
function relativeLabels() {
  const dict = DICTIONARIES[getActiveLocale()];
  const text = (key: string) => (dict[key] as string) ?? key;
  return {
    today: text("time.today"),
    yesterday: text("time.yesterday"),
    justNow: text("time.justNow"),
    minutes: text("time.minutes"),
    hours: text("time.hours"),
  };
}

export function formatDate(iso: string): string {
  return sharedFormatDate(iso, getActiveTag());
}

export function formatDateTime(iso: string): string {
  return sharedFormatDateTime(iso, getActiveTag());
}

export function formatTime(iso: string): string {
  return sharedFormatTime(iso, getActiveTag());
}

export function dayLabel(iso: string): string {
  return sharedDayLabel(iso, getActiveTag(), relativeLabels());
}

export function timeAgo(iso: string): string {
  return sharedTimeAgo(iso, getActiveTag(), relativeLabels());
}
