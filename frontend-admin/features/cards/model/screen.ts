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

/** Сортировка списка: «по вкладке» — как считает `sortForTab`; остальные поверх неё. */
export type CardSort = "tab" | "conf_asc" | "conf_desc" | "missing" | "title";

export const CARD_SORT_OPTIONS: { value: CardSort; label: string }[] = [
  { value: "tab", label: "По вкладке" },
  { value: "conf_asc", label: "ИИ % ↑ (сомнительные первыми)" },
  { value: "conf_desc", label: "ИИ % ↓" },
  { value: "missing", label: "Не хватает полей ↓" },
  { value: "title", label: "Название А–Я" },
];

export interface ListFilter {
  vitrine: Vitrine;
  tab: CardTab;
  query: string;
  /** Только во вкладке «Готово»: проверены, но не хватает обязательных. */
  onlyIncomplete: boolean;
  /** Не задана — «по вкладке». */
  sort?: CardSort;
}

/** Порядок поверх сортировки вкладки (стабильная: равные остаются как в `sortForTab`). */
export function sortCards(list: CardItem[], sort: CardSort | undefined): CardItem[] {
  if (!sort || sort === "tab") return list;
  const conf = (i: CardItem) => i.cardConfidence ?? -1;
  const cmp: Record<Exclude<CardSort, "tab">, (a: CardItem, b: CardItem) => number> = {
    conf_asc: (a, b) => conf(a) - conf(b),
    conf_desc: (a, b) => conf(b) - conf(a),
    missing: (a, b) => missingCount(b) - missingCount(a),
    title: (a, b) => a.title.localeCompare(b.title, "ru"),
  };
  return [...list].sort(cmp[sort]);
}

export function listForTab(items: CardItem[], f: ListFilter): CardItem[] {
  const byVitrine = items.filter((i) => matchesVitrine(i, f.vitrine));
  return sortCards(
    sortForTab(
      byVitrine.filter((i) => tabOf(i) === f.tab && matchesQuery(i, f.query) && (!f.onlyIncomplete || f.tab !== "ready" || missingCount(i) > 0)),
      f.tab
    ),
    f.sort
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

/** Ссылка «оформить эти товары с ИИ» из других экранов (поставка): `/cards?ids=a,b,c` открывает мастер с ними. */
export const CARDS_IDS_PARAM = "ids";

export function cardsWizardHref(productIds: string[]): string {
  return `/cards?${CARDS_IDS_PARAM}=${productIds.map(encodeURIComponent).join(",")}`;
}

/** Из ссылки — только товары, которые есть в выгрузке, без повторов, в порядке ссылки. */
export function idsFromParam(raw: string | null, items: CardItem[]): string[] {
  if (!raw) return [];
  const known = new Set(items.map((i) => i.id));
  return [...new Set(raw.split(",").map((x) => x.trim()).filter((x) => known.has(x)))];
}

/** Товары, у которых карточку ещё оформлять (вкладка «Оформить»): ИИ их не заполнял. */
export function unfinishedOf(productIds: string[], items: CardItem[]): string[] {
  const draft = new Set(items.filter((i) => tabOf(i) === "draft").map((i) => i.id));
  return [...new Set(productIds)].filter((id) => draft.has(id));
}
