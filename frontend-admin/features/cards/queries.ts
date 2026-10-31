"use client";

/**
 * Запросы и записи «Карточек». Статистика — общий запрос: бейдж меню (карточки в ожидании: черновики + заполненные ИИ,
 * ещё не проверенные) читает её же, а экран считает вкладки из выгрузки.
 */
import { QUERY_PRESETS } from "@shop/core/query";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { isAuthenticated } from "@/lib/session";
import { invalidateTranslations } from "@/features/translation";
import { catalogKeys } from "@/features/catalog";
import { cardsApi, type CardStats } from "./api";
import { cardsKeys } from "./keys";

export function useCardStats() {
  return useQuery({
    queryKey: cardsKeys.stats(),
    queryFn: cardsApi.stats,
    // 2 минуты, как было.
    refetchInterval: QUERY_PRESETS.live.refetchInterval * 4,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: isAuthenticated(),
  });
}

/** Every product with its card data (the catalog is small — filtered on the client). */
export function useCardItems() {
  return useQuery({ queryKey: cardsKeys.export(), queryFn: () => cardsApi.export("all"), staleTime: QUERY_PRESETS.list.staleTime });
}

/** Схема каталога в виде «Карточек» (5 минут, как было). */
export function useCardSchema() {
  return useQuery({ queryKey: cardsKeys.schema(), queryFn: cardsApi.schema, staleTime: QUERY_PRESETS.list.staleTime * 10 });
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
  qc.invalidateQueries({ queryKey: cardsKeys.stats() });
  qc.invalidateQueries({ queryKey: cardsKeys.export() });
  qc.invalidateQueries({ queryKey: catalogKeys.productsRoot() });
  invalidateTranslations(qc);
  if (schemaToo) {
    qc.invalidateQueries({ queryKey: cardsKeys.schema() });
    qc.invalidateQueries({ queryKey: catalogKeys.catalogRoot() });
  }
}
