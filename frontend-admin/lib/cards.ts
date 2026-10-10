"use client";

/**
 * Shared queries of the «Карточки» screen: the nav badge (cards waiting: drafts + filled by the AI
 * but not reviewed yet) uses the stats cache entry; the page counts its tabs from the items.
 */
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { isAuthenticated } from "@/lib/api";
import { cardsApi, type CardStats } from "@/lib/cards-api";
import { invalidateTranslations } from "@/lib/translations";

export const CARDS_STATS_KEY = ["admin", "cards", "stats"] as const;
export const CARDS_EXPORT_KEY = ["admin", "cards", "export"] as const;
export const CATALOG_SCHEMA_KEY = ["admin", "catalog", "schema"] as const;

export function useCardStats() {
  return useQuery({
    queryKey: CARDS_STATS_KEY,
    queryFn: () => cardsApi.stats(),
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: isAuthenticated(),
  });
}

/** Every product with its card data (the catalog is small — filtered on the client). */
export function useCardItems() {
  return useQuery({ queryKey: CARDS_EXPORT_KEY, queryFn: () => cardsApi.export("all"), staleTime: 30_000 });
}

export function useCatalogSchema() {
  return useQuery({ queryKey: CATALOG_SCHEMA_KEY, queryFn: () => cardsApi.schema(), staleTime: 5 * 60_000 });
}

/** Badge: «Оформить» (drafts on the storefront + new hidden) + «Проверить» (every AI_FILLED) of «Карточки». */
export function pendingCards(stats: CardStats | undefined): number {
  return stats ? stats.draft + stats.aiFilled : 0;
}

/**
 * After any write: refresh the badge, the counters, the lists and the product screens — and
 * «Переводы» (accepting a card with uk/en, renaming a product or category adds/stales texts there).
 */
export function invalidateCards(qc: QueryClient, schemaToo = false): void {
  qc.invalidateQueries({ queryKey: CARDS_STATS_KEY });
  qc.invalidateQueries({ queryKey: CARDS_EXPORT_KEY });
  qc.invalidateQueries({ queryKey: ["products"] });
  invalidateTranslations(qc);
  if (schemaToo) {
    qc.invalidateQueries({ queryKey: CATALOG_SCHEMA_KEY });
    qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
  }
}
