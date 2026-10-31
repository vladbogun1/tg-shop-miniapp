/** Экран «Карточки»: счётчики вкладок, вкладка по умолчанию, список вкладки, выбор в пределах списка. Чистая логика. */
import type { CardItem } from "./item";
import { matchesQuery, matchesVitrine, missingCount, sortForTab, tabOf, TAB_LABEL, type CardTab, type Vitrine } from "./view";

export function tabCounts(items: CardItem[]): Record<CardTab, number> {
  const c: Record<CardTab, number> = { draft: 0, review: 0, ready: 0 };
  for (const i of items) c[tabOf(i)]++;
  return c;
}

/** Первый заход: вкладка, где есть работа («Проверить» — самая быстрая победа). */
export function defaultTab(counts: Record<CardTab, number>): CardTab {
  return counts.review > 0 ? "review" : counts.draft > 0 ? "draft" : "ready";
}

export interface ListFilter {
  vitrine: Vitrine;
  tab: CardTab;
  query: string;
  /** Только во вкладке «Готово»: проверены, но не хватает обязательных. */
  onlyIncomplete: boolean;
}

export function listForTab(items: CardItem[], f: ListFilter): CardItem[] {
  const byVitrine = items.filter((i) => matchesVitrine(i, f.vitrine));
  return sortForTab(
    byVitrine.filter((i) => tabOf(i) === f.tab && matchesQuery(i, f.query) && (!f.onlyIncomplete || f.tab !== "ready" || missingCount(i) > 0)),
    f.tab
  );
}

/** Выбор живёт в пределах списка: что из него ушло — снимается. Тот же Set, если ничего не изменилось. */
export function pruneSelection(prev: Set<string>, visible: CardItem[]): Set<string> {
  if (!prev.size) return prev;
  const ids = new Set(visible.map((i) => i.id));
  const next = new Set([...prev].filter((id) => ids.has(id)));
  return next.size === prev.size ? prev : next;
}

/** Подпись «откуда выбор» для мастера. */
export function wizardLabel(selectedCount: number, total: number, tab: CardTab): string {
  return selectedCount ? `отмеченные: ${total}` : `вкладка «${TAB_LABEL[tab]}»: ${total}`;
}
