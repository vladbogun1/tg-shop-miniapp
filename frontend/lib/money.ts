/**
 * Money for the customer app: the shared implementation, bound to the language on screen.
 *
 * Only the grouping changes with the language (1 030 ₴ vs 1,030 ₴) — the rounding rules stay in
 * `@shop/shared`, because the app, the admin panel and the Telegram cards must agree on them.
 */
import { money as sharedMoney } from "@shop/shared";
import { getActiveTag } from "@/i18n/active";

export { toMajor, toMinor } from "@shop/shared";

export function money(minor: number | null | undefined, currency = "UAH"): string {
  return sharedMoney(minor, currency, getActiveTag());
}
