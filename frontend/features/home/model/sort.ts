import { getActiveTag } from "@shop/core/i18n";
import type { Product } from "@/lib/api";

export type SortKey = "popular" | "price_asc" | "price_desc" | "name";

/** "Клавиатуры" → "клавиатуры" for "Все клавиатуры"; acronyms ("IEM") stay as they are. */
export function lowerFirst(s: string): string {
  return s.length > 1 && s[1] === s[1].toLocaleLowerCase() ? s[0].toLocaleLowerCase() + s.slice(1) : s;
}

/**
 * Sort in place: in stock (and held for me) → pre-order → out of stock (`tierOf`), then by the chosen key.
 * Default orders by bestseller (soldCount).
 */
export function sortProducts(list: Product[], sort: SortKey, tierOf: (p: Product) => number): Product[] {
  return list.sort((a, b) => {
    const ai = tierOf(a);
    const bi = tierOf(b);
    if (ai !== bi) return ai - bi;
    switch (sort) {
      case "price_asc":
        return a.priceMinor - b.priceMinor;
      case "price_desc":
        return b.priceMinor - a.priceMinor;
      case "name":
        return a.title.localeCompare(b.title, getActiveTag());
      case "popular":
      default:
        return (b.soldCount ?? 0) - (a.soldCount ?? 0) || a.title.localeCompare(b.title, getActiveTag());
    }
  });
}
