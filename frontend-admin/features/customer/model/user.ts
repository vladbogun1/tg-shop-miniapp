import { LANG_LABEL, LANG_SHORT, type ShopLang } from "@/lib/shop-lang";
import type { UserCardDto } from "./types";

/** Карточка для покупателя, которого ещё нет в базе (журнал, чат поддержки, заказ): известно только то, что знает экран. */
export function stubUserCard(known: { telegramUserId: number; username: string | null; firstName: string | null }): UserCardDto {
  return {
    ...known,
    lastName: null,
    languageCode: null,
    locale: null,
    createdAt: null,
    lastSeenAt: null,
    premium: false,
    botBlocked: false,
    ordersCount: 0,
    totalSpentMinor: 0,
    lastOrderAt: null,
  };
}

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

/** Средний чек в minor-единицах; 0, пока заказов нет. */
export function avgCheckMinor(u: Pick<UserCardDto, "ordersCount" | "totalSpentMinor">): number {
  return u.ordersCount > 0 ? Math.round(u.totalSpentMinor / u.ordersCount) : 0;
}

/** «UA (из Telegram, в магазине не выбран)» для вкладки «Данные» профиля. */
export function languageDetail(u: UserCardDto): string {
  const l = userLang(u);
  if (l.label === "—") return "не определён";
  return l.fromTelegram ? `${l.label} (из Telegram, в магазине не выбран)` : `${l.label} (выбран в магазине)`;
}
