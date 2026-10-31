import type { Schemas } from "@shop/core/api/schemas";

type TrStats = Schemas["Stats"];

/**
 * Тексты, которые покупатель видит по-русски, хотя не должен: «Нужно перевести» + «Устарели» —
 * в тех же единицах, что и вкладки экрана (уникальные русские тексты).
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
