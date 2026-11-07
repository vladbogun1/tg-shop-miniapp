"use client";

/**
 * Данные экрана проверки результата ИИ по карточке: ответ задачи → разбор → строки, соседи по категории для
 * правдоподобия чисел, конфликт правок (правки после старта и их авторы — с сервера; у старых задач без снимка —
 * только отпечаток). Только вычисление, без записи.
 */
import { initialSelection, type AiJob, type ReviewField } from "@/features/ai";
import { useMemo } from "react";
import { cardVersion, extraInitialKeys, reviewRows } from "../../model/ai-card";
import { cardChanges, type CardChanges, type ServerChanges } from "../../model/ai-conflict";
import { reviewAnswer } from "../../model/completion";
import { assignCardIds, type CardItem } from "../../model/item";
import type { CardSchema } from "../../model/schema";
import type { ProductReview } from "../../model/types";
import { parseNumberLoose } from "../../model/value";
import { useCardItems } from "../../queries";

export interface CardAiReviewData {
  review: ProductReview | null;
  rows: ReviewField[];
  initial: Set<string>;
  versionChanged: boolean;
  /** Правки после старта по данным сервера (кто и что); null — снимка нет или результат уже разобран. */
  changes: CardChanges | null;
  /** Ответ не разобрался: что сказать человеку. */
  problems: string[];
}

function neighborsOf(items: CardItem[] | undefined, item: CardItem) {
  return (key: string): number[] => {
    if (!items) return [];
    const out: number[] = [];
    for (const x of items) {
      if (x.id === item.id || x.categorySlug !== item.categorySlug) continue;
      const n = parseNumberLoose(x.specs?.[key]);
      if (n !== null) out.push(n);
    }
    return out;
  };
}

/** Разбор ответа задачи по товару в строки проверки. Чистое вычисление: годится и для экрана, и для пакета. */
export function computeCardAiReview(
  job: AiJob | undefined,
  item: CardItem | null,
  schema: CardSchema | undefined,
  all: CardItem[] | undefined,
): CardAiReviewData {
  const empty: CardAiReviewData = { review: null, rows: [], initial: new Set(), versionChanged: false, changes: null, problems: [] };
  if (!job || !item || !schema || !job.answer) return empty;
  const out = reviewAnswer(job.answer, { schema, items: [item], ids: assignCardIds([item.id]) }, item.id);
  if (!out.product) return { ...empty, problems: out.errors.length ? out.errors : ["В ответе нет данных по этому товару."] };
  const changes = cardChanges(job.subjectChanges as ServerChanges | undefined, item, schema);
  // Без снимка (задача до V92) признак правок — отпечаток; после разбора результата (outcome) не блокируем ничего.
  const versionChanged = !job.outcome && !!job.subjectVersion && cardVersion(item) !== job.subjectVersion;
  const rows = reviewRows(out.product, { changes, versionChanged: changes ? false : versionChanged, neighbors: neighborsOf(all, item) });
  const initial = new Set([...initialSelection(rows), ...extraInitialKeys(out.product, rows, item.unfinished === true)]);
  return { review: out.product, rows, initial, versionChanged: changes ? Object.keys(changes.fields).length > 0 : versionChanged, changes, problems: out.errors };
}

export function useCardAiReview(job: AiJob | undefined, item: CardItem | null, schema: CardSchema | undefined): CardAiReviewData {
  const all = useCardItems();
  return useMemo(() => computeCardAiReview(job, item, schema, all.data), [job, item, schema, all.data]);
}
