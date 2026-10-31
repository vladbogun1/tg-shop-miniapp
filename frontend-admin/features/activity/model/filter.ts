import { sourceLabel, typeLabel } from "./labels";
import type { ActivityFacets, ActivityFilter } from "./types";

export const ACTIVITY_PAGE = 50;

/** Что введено в форме фильтров ленты (поля как в UI: пустая строка = «не задано»). */
export interface FeedFilterInput {
  source: string;
  type: string;
  result: string;
  recipient: string;
  errorCode: string;
  order: string;
  q: string;
  from: string;
  to: string;
  customerId?: number;
}

/** Пустые поля не уходят в запрос. */
export function buildFilter(i: FeedFilterInput): ActivityFilter {
  return {
    source: i.source || undefined,
    type: i.type || undefined,
    result: i.result || undefined,
    recipient: i.recipient || undefined,
    errorCode: i.errorCode || undefined,
    tgUserId: i.customerId,
    order: i.order || undefined,
    q: i.q || undefined,
    from: i.from || undefined,
    to: i.to || undefined,
  };
}

export function isFiltered(filter: ActivityFilter): boolean {
  return Object.values(filter).some((v) => v !== undefined);
}

/** Типы событий для выпадающего списка: при выбранном источнике — только его, без дублей, по алфавиту. */
export function typeOptions(facets: ActivityFacets | undefined, source: string): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const t of facets?.types ?? []) {
    if (source && t.source !== source) continue;
    if (seen.has(t.type)) continue;
    seen.add(t.type);
    out.push({ value: t.type, label: (source ? "" : sourceLabel(t.source) + " · ") + typeLabel(t.type) });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "ru"));
}
