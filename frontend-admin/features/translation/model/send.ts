/** «Перевод через ИИ»: что именно отправить на сервер и как свести итог. Чистые функции. */
import type { Schemas } from "@shop/core/api/schemas";
import type { ReviewRow } from "./review";
import type { TrImportItem, TrLocale } from "./types";
import { LOCALES } from "./workset";

type ImportResult = Schemas["ImportResult"];
type SourceFixResult = Schemas["SourceFixResult"];

export interface SendSummary {
  import: Partial<Record<TrLocale, ImportResult>>;
  fixes: { id: string; result?: SourceFixResult; error?: string }[];
  importErrors: string[];
}

/** Что уйдёт на сервер: пакеты импорта по языкам (обычные и с `force`) и строки с правкой оригинала. */
export interface AiSendPlan {
  fixRows: ReviewRow[];
  byLocale: Record<TrLocale, TrImportItem[]>;
  forced: Record<TrLocale, TrImportItem[]>;
}

export const REASON_RU: Record<string, string> = {
  STALE: "оригинал уже изменился",
  MANUAL: "ручной перевод не перезаписан",
  NOT_FOUND: "поле не найдено",
  NO_SOURCE: "оригинал пустой",
};

/**
 * Разбор отмеченных строк. Устаревшие ручные переводы админа заменяются только для явно отмеченных строк —
 * они уходят отдельным запросом с `force`, остальное никогда не перезаписывает MANUAL.
 */
export function planSend(chosenRows: ReviewRow[], applyFix: Set<string>) {
  const fixRows = chosenRows.filter((r) => applyFix.has(r.id) && r.ruChanged && r.ruIssues.length === 0);
  const plain = chosenRows.filter((r) => !fixRows.includes(r));
  const byLocale: Record<TrLocale, TrImportItem[]> = { uk: [], en: [] };
  const forced: Record<TrLocale, TrImportItem[]> = { uk: [], en: [] };
  for (const r of plain) {
    for (const f of r.str.fields) {
      // only the languages of the session: with the «UK» filter English is not touched
      for (const l of r.langs) {
        if (f.status[l] === "TRANSLATED") continue;
        const item = { entityType: f.entityType, entityId: f.entityId, field: f.field, sourceHash: f.sourceHash, text: r[l] };
        (f.origin[l] === "MANUAL" ? forced : byLocale)[l].push(item);
      }
    }
  }
  const fieldsTotal = LOCALES.reduce((n, l) => n + byLocale[l].length + forced[l].length, 0);
  const manualTotal = LOCALES.reduce((n, l) => n + forced[l].length, 0);
  return { plan: { fixRows, byLocale, forced } satisfies AiSendPlan, fieldsTotal, manualTotal };
}

export function mergeResults(a: ImportResult | undefined, b: ImportResult): ImportResult {
  if (!a) return b;
  return {
    applied: a.applied + b.applied,
    skippedStale: a.skippedStale + b.skippedStale,
    skippedManual: a.skippedManual + b.skippedManual,
    notFound: a.notFound + b.notFound,
    invalid: a.invalid + b.invalid,
    rejected: [...a.rejected, ...b.rejected],
  };
}

/** Сохранено переводов: импорт + переводы, записанные вместе с правкой оригинала. */
export function summaryApplied(s: SendSummary): number {
  return (s.import.uk?.applied ?? 0) + (s.import.en?.applied ?? 0) + s.fixes.reduce((n, f) => n + (f.result?.translationsApplied ?? 0), 0);
}

/** Сколько оригиналов исправлено. */
export function summaryFixed(s: SendSummary): number {
  return s.fixes.filter((f) => f.result && f.result.updated > 0).length;
}

/** Строки, чья правка оригинала не прошла: остаются в проверке для новой попытки. */
export function failedFixIds(s: SendSummary): Set<string> {
  return new Set(s.fixes.filter((f) => f.error || !f.result?.updated).map((f) => f.id));
}

/**
 * Метки ручного пути для метрик: одна на часть промпта, из которой сохранена хоть одна строка (встроенный ИИ тоже
 * считает по задаче на часть). Номер части и её первая строка — id метки; уже отмеченные части не повторяются.
 */
export function partMarks(parts: readonly { ids: string[] }[], savedIds: ReadonlySet<string>, marked: ReadonlySet<string>): string[] {
  const out: string[] = [];
  parts.forEach((p, i) => {
    const id = `p${i + 1}-${p.ids[0] ?? ""}`.slice(0, 64);
    if (!marked.has(id) && p.ids.some((x) => savedIds.has(x))) out.push(id);
  });
  return out;
}
