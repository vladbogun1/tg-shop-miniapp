"use client";

/**
 * Shared query of the «Переводы» stats: the nav badge (fields × languages that need a
 * translation — missing or stale, uk + en) and the counters on the page use the same cache entry.
 */
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { adminApi, isAuthenticated, type TrStats } from "@/lib/api";

export const TR_STATS_KEY = ["admin", "translations", "stats"] as const;
export const TR_EXPORT_KEY = ["admin", "translations", "export"] as const;

export function useTranslationStats() {
  return useQuery({
    queryKey: TR_STATS_KEY,
    queryFn: () => adminApi.translationsStats(),
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: isAuthenticated(),
  });
}

/** Missing + stale over both languages. */
export function pendingCount(stats: TrStats | undefined): number {
  if (!stats) return 0;
  let n = 0;
  for (const l of Object.values(stats.locales)) {
    const all = l?.ALL;
    if (all) n += all.missing + all.stale;
  }
  return n;
}

/** After any write: refresh the badge, the counters and the lists. */
export function invalidateTranslations(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: TR_STATS_KEY });
  qc.invalidateQueries({ queryKey: TR_EXPORT_KEY });
}
