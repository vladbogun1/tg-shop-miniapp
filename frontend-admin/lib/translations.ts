"use client";

/**
 * Shared query of the «Переводы» stats: the nav badge (unique texts that need a translation —
 * missing or stale) uses it; the page counts the same buckets from the export.
 */
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { adminApi, isAuthenticated, type TrExportItem, type TrLocale, type TrOrigin, type TrStats } from "@/lib/api";

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

/**
 * Texts that customers see in Russian although they should not: «Нужно перевести» + «Устарели»,
 * in the same units as the tabs of the screen (unique Russian texts).
 */
export function pendingCount(stats: TrStats | undefined): number {
  if (!stats) return 0;
  if (stats.texts) return stats.texts.missing + stats.texts.stale;
  // Older backend: fields × languages.
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

/** Raw export of both languages — the page builds the work set from it (`buildWorkSet`). */
export interface TrExportData {
  uk: TrExportItem[];
  en: TrExportItem[];
}

export function useTranslationExport() {
  return useQuery({
    queryKey: TR_EXPORT_KEY,
    queryFn: async (): Promise<TrExportData> => {
      const [uk, en] = await Promise.all([adminApi.translationsExport("uk"), adminApi.translationsExport("en")]);
      return { uk, en };
    },
    staleTime: 30_000,
  });
}

export interface TrPatch {
  entityType: string;
  entityId: string;
  field: string;
  locale: TrLocale;
  text: string;
  origin: TrOrigin;
}

/**
 * After a successful «Принять» of one text: the fields are current and checked now. Patching the
 * cached export keeps the review going without re-downloading every text after each keystroke;
 * the stats (nav badge) are refetched, the export is marked stale for the next visit.
 */
export function patchTranslations(qc: QueryClient, patches: TrPatch[]): void {
  if (patches.length) {
    const byKey = new Map(patches.map((p) => [`${p.locale}|${p.entityType}:${p.entityId}:${p.field}`, p]));
    qc.setQueryData<TrExportData>(TR_EXPORT_KEY, (old) => {
      if (!old) return old;
      const apply = (locale: TrLocale, items: TrExportItem[]) =>
        items.map((it) => {
          const p = byKey.get(`${locale}|${it.entityType}:${it.entityId}:${it.field}`);
          return p
            ? { ...it, status: "TRANSLATED" as const, text: p.text, origin: p.origin, reviewed: true, prevSource: null }
            : it;
        });
      return { uk: apply("uk", old.uk), en: apply("en", old.en) };
    });
  }
  qc.invalidateQueries({ queryKey: TR_STATS_KEY });
  qc.invalidateQueries({ queryKey: TR_EXPORT_KEY, refetchType: "none" });
}
