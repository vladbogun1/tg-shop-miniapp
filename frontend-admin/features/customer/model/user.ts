import { LANG_LABEL, LANG_SHORT, type ShopLang } from "@/lib/shop-lang";
import type { UserCardDto } from "./types";

export function displayName(u: UserCardDto): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (u.username) return "@" + u.username;
  return "#" + u.telegramUserId;
}

export function initials(u: UserCardDto): string {
  const a = u.firstName?.trim()?.[0] ?? u.username?.trim()?.[0] ?? "";
  const b = u.lastName?.trim()?.[0] ?? "";
  const both = (a + b).toUpperCase();
  return both || String(u.telegramUserId).slice(0, 2);
}

/** Shop language (users.locale) with the Telegram one as a marked fallback. */
export function userLang(u: UserCardDto): { label: string; fromTelegram: boolean } {
  if (u.locale) return { label: LANG_SHORT[u.locale] ?? u.locale.toUpperCase(), fromTelegram: false };
  if (u.languageCode) return { label: u.languageCode.slice(0, 2).toUpperCase(), fromTelegram: true };
  return { label: "—", fromTelegram: false };
}

/** «пишет на: Украинский» — the language to answer in (users.locale, else Telegram's). */
export function languageLine(u: UserCardDto): string {
  if (u.locale) return "язык магазина: " + (LANG_LABEL[u.locale as ShopLang] ?? u.locale);
  if (u.languageCode) return "язык Telegram: " + u.languageCode;
  return "";
}

export function telegramHref(u: UserCardDto): string {
  return u.username ? `https://t.me/${u.username}` : `tg://user?id=${u.telegramUserId}`;
}
