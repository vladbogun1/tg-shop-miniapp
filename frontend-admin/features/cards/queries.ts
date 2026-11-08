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
import { hiddenOf, unfinishedOf } from "./model/screen";

/** Опрос счётчиков «Карточек»: 2 минуты, как было. */
const STATS_REFETCH_MS = QUERY_PRESETS.live.refetchInterval * 4;

export function useCardStats() {
  return useQuery({
    queryKey: cardsKeys.stats(),
    queryFn: cardsApi.stats,
    refetchInterval: STATS_REFETCH_MS,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: isAuthenticated(),
  });
}

/** Every product with its card data (the catalog is small — filtered on the client). */
export function useCardItems() {
  return useQuery({ queryKey: cardsKeys.export(), queryFn: () => cardsApi.export("all"), staleTime: QUERY_PRESETS.list.staleTime });
}

/**
 * Card data of just these products (a supply's lines): `?ids=` instead of the whole catalog export (≈1,5 МБ).
 * Under the export key, so every card write refreshes it too.
 */
function useCardItemsOf(productIds: string[]) {
  const ids = [...new Set(productIds)].sort().join(",");
  return useQuery({
    queryKey: cardsKeys.exportOf(ids),
    queryFn: () => cardsApi.export("all", ids.split(",")),
    enabled: ids.length > 0,
    staleTime: QUERY_PRESETS.list.staleTime,
  });
}

/** Which of these products still need a card (tab «Оформить») — for «Оформить с ИИ» on other screens. */
export function useUnfinishedCards(productIds: string[]): string[] {
  const q = useCardItemsOf(productIds);
  return q.data ? unfinishedOf(productIds, q.data) : [];
}

/** Which of these products are ready but hidden from the storefront — for «Выложить» on other screens. */
export function useHiddenCards(productIds: string[]): string[] {
  const q = useCardItemsOf(productIds);
  return q.data ? hiddenOf(productIds, q.data) : [];
}

/** Схема каталога в виде «Карточек» (5 минут, как было). */
export function useCardSchema() {
  return useQuery({ queryKey: cardsKeys.schema(), queryFn: cardsApi.schema, staleTime: QUERY_PRESETS.static.staleTime });
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
