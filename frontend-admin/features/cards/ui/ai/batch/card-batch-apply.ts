/**
 * Пакет карточек: запуск (промпт и отпечаток на каждый товар собирает фронт), быстрый приём одной карточки и
 * «Принять безопасное» (только пустые характеристики и пустое описание, в рамке begin/finish сервера).
 * Запись — тем же импортом карточки, что у обычного экрана проверки; отчёт о счётчиках уходит в `outcome`.
 */
import { aiApi, batchApi, initialSelection, isSafeKey, outcomeCounts, type AiBatch, type AiJob, type AiSafeApplied, type ReviewField } from "@/features/ai";
import { cardsApi } from "../../../api";
import { CARD_PROMPT_VERSION, snapshotOf, toProductSel } from "../../../model/ai-card";
import { assignCardIds, type CardItem } from "../../../model/item";
import { buildCardPrompt } from "../../../model/prompt";
import type { CardSchema } from "../../../model/schema";
import { autoReady, buildImportItem } from "../../../model/selection";
import type { ProductReview } from "../../../model/types";
import { saveSnapshot } from "../card-subject";
import { computeCardAiReview } from "../use-card-ai-review";

/** Запустить пакет по выбранным товарам: у каждого свой промпт и отпечаток карточки на момент запуска. */
export async function startCardBatch(items: CardItem[], schema: CardSchema, idemKey: string): Promise<AiBatch> {
  const batch = await batchApi.startCards(
    {
      promptVersion: CARD_PROMPT_VERSION,
      items: items.map((item) => ({
        productId: item.id,
        subjectVersion: snapshotOf(item).version,
        prompt: buildCardPrompt([item], schema, { part: 1, total: 1, ids: assignCardIds([item.id]) }),
      })),
    },
    idemKey,
  );
  items.forEach((item) => saveSnapshot(item.id, snapshotOf(item)));
  return batch;
}

export interface JobPlan {
  job: AiJob;
  item: CardItem;
  review: ProductReview;
  rows: ReviewField[];
  /** Что принять по умолчанию (пустые поля). */
  selected: Set<string>;
}

/** Разбор результата задачи по свежей карточке; null — ответа нет или он не разобрался. */
export function planOf(job: AiJob, item: CardItem | null, schema: CardSchema | undefined, all: CardItem[] | undefined): JobPlan | null {
  const data = computeCardAiReview(job, item, schema, all);
  if (!item || !data.review || data.rows.length === 0) return null;
  return { job, item, review: data.review, rows: data.rows, selected: data.initial };
}

/** Безопасное из плана: из «Заполнит пустое» остаются характеристики и описание. */
export function safeKeysOf(plan: JobPlan): string[] {
  return [...initialSelection(plan.rows)].filter(isSafeKey);
}

async function save(plan: JobPlan, selected: ReadonlySet<string>, opts: { translations: boolean; markReady: boolean }): Promise<void> {
  const sel = toProductSel(plan.review, selected, { translations: opts.translations });
  const payload = buildImportItem(plan.review, sel, { markReady: opts.markReady && autoReady(plan.review, sel), publish: false });
  if (!payload) throw new Error("Нечего записывать");
  const res = await cardsApi.import({ items: [payload], replaceSpecs: false });
  const rejected = res.rejected.find((x) => x.productId === plan.item.id);
  if (rejected) throw new Error(`Сервер не принял карточку: ${rejected.reason}`);
  await aiApi.outcome(plan.job.id, outcomeCounts(plan.rows, selected));
}

/** «Принять» в ленте: то же, что кнопка «Применить» на экране проверки с выбором по умолчанию. */
export const acceptPlan = (plan: JobPlan): Promise<void> => save(plan, plan.selected, { translations: true, markReady: true });

/** Одна карточка «безопасно»: сервер снимает значения до записи и сверяет после; нарушение он возвращает сам. */
export async function applySafe(plan: JobPlan): Promise<AiSafeApplied> {
  const keys = new Set(safeKeysOf(plan));
  const begun = await batchApi.applyBegin(plan.job.id);
  let failure: unknown = null;
  try {
    await save(plan, keys, { translations: false, markReady: false });
  } catch (e) {
    failure = e;
  }
  // Закрываем запись и при сбое: незавершённая запись не должна висеть без итога.
  const applied = await batchApi.applyFinish(begun.id);
  if (failure) throw failure;
  return applied;
}
