import { LANG_SHORT } from "@/lib/shop-lang";
import type { UserMetricsDto } from "./types";

/** users.locale (the language chosen in the shop); "—" = never chose. */
export function languageSlices(languages: UserMetricsDto["languages"] | undefined): { name: string; value: number }[] {
  return (languages ?? []).map((l) => ({
    name: l.language && l.language !== "—" ? (LANG_SHORT[l.language] ?? l.language) : "не выбран",
    value: l.count,
  }));
}

export function topCustomerBars(top: UserMetricsDto["topCustomers"] | undefined): { name: string; spent: number; orders: number }[] {
  return (top ?? []).slice(0, 8).map((t) => ({
    name: t.name || "#" + t.telegramUserId,
    spent: t.totalSpentMinor,
    orders: t.ordersCount,
  }));
}
