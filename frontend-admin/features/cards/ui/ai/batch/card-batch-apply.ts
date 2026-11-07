/**
 * Пакет карточек: запуск (промпт и отпечаток на каждый товар собирает фронт), быстрый приём одной карточки и
 * «Принять безопасное» (только пустые характеристики и пустое описание). Запись — тем же импортом карточки, что у
 * экрана проверки, в рамке журнала применений сервера (`inApplyLog`: отмена 24 часа); отчёт о счётчиках — в `outcome`.
 */
import { aiApi, batchApi, inApplyLog, initialSelection, isSafeKey, outcomeCounts, type AiBatch, type AiBatchRow, type AiJob, type AiSafeApplied, type ReviewField } from "@/features/ai";
import { cardsApi, type CardImportResult } from "../../../api";
import { CARD_PROMPT_VERSION, cardVersion, newBrandOf, toProductSel } from "../../../model/ai-card";
import { assignCardIds, type CardItem } from "../../../model/item";
import type { PhotoJob } from "../../../model/photos";
import { buildCardPrompt } from "../../../model/prompt";
import type { CardSchema } from "../../../model/schema";
import { autoReady, buildImportItem, defaultPhotos } from "../../../model/selection";
import { replacingImport } from "../../../model/spec-replace";
import type { ProductReview } from "../../../model/types";
import { computeCardAiReview } from "../use-card-ai-review";
import type { BatchNote } from "./batch-notes";

/** Запустить пакет по выбранным товарам: у каждого свой промпт и отпечаток карточки на момент запуска. */
export async function startCardBatch(items: CardItem[], schema: CardSchema, idemKey: string): Promise<AiBatch> {
  const batch = await batchApi.startCards(
    {
      promptVersion: CARD_PROMPT_VERSION,
      items: items.map((item) => ({
        productId: item.id,
        subjectVersion: cardVersion(item),
        prompt: buildCardPrompt([item], schema, { part: 1, total: 1, ids: assignCardIds([item.id]) }),
      })),
    },
    idemKey,
  );
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

/** Разбор результата задачи по свежей карточке; null — ответа нет или он не разобрался. `brands` — бренды каталога. */
export function planOf(job: AiJob, item: CardItem | null, schema: CardSchema | undefined, all: CardItem[] | undefined, brands?: readonly string[]): JobPlan | null {
  const data = computeCardAiReview(job, item, schema, all, brands);
  if (!item || !data.review || data.rows.length === 0) return null;
  return { job, item, review: data.review, rows: data.rows, selected: data.initial };
}

/** Безопасное из плана: из «Заполнит пустое» остаются характеристики и описание. */
export function safeKeysOf(plan: JobPlan): string[] {
  return [...initialSelection(plan.rows)].filter(isSafeKey);
}

/** Бренд из ответа, которого нет в каталоге: такую карточку «Принять безопасное» оставляет человеку. */
export const holdsNewBrand = (plan: JobPlan, brands: readonly string[] | undefined): boolean => newBrandOf(plan.review, brands) !== null;

interface WriteOpts {
  translations: boolean;
  markReady: boolean;
  /** «Заменить характеристики целиком»: чего нет в ответе, удаляется. */
  replace?: boolean;
}

/** Запись выбранного из разбора тем же импортом, что у экрана проверки; без цены и без выкладки. */
export async function writeCard(review: ProductReview, productId: string, selected: ReadonlySet<string>, opts: WriteOpts): Promise<CardImportResult> {
  const sel = toProductSel(review, selected, { translations: opts.translations });
  const chosen = buildImportItem(review, sel, { markReady: opts.markReady && autoReady(review, sel), publish: false });
  const payload = opts.replace ? replacingImport(review, chosen) : chosen;
  if (!payload) throw new Error("Нечего записывать");
  const res = await cardsApi.import({ items: [payload], replaceSpecs: opts.replace === true });
  const rejected = res.rejected.find((x) => x.productId === productId);
  if (rejected) throw new Error(`Сервер не принял карточку: ${rejected.reason}`);
  return res;
}

/** Что сервер при записи отбросил и какие бренды завёл — в итог пакета. */
function notesOf(res: CardImportResult, jobId: number, productId: string): BatchNote[] {
  const dropped: BatchNote[] = res.issues
    .filter((i) => i.productId === productId)
    .map((i) => ({ jobId, productId, kind: "dropped", text: i.key ? `${i.key}: ${i.message}` : i.message }));
  const brands: BatchNote[] = res.createdBrands.map((b) => ({ jobId, productId, kind: "brand", text: `Заведён бренд «${b}»` }));
  return [...dropped, ...brands];
}

export interface RowAccepted {
  /** Запись журнала: по ней «Отменить» в ленте. */
  applyId: number;
  title: string;
  /** Отмеченные по умолчанию фото из ответа — как у «Править» → «Применить»; грузит вызывающий. */
  photos: PhotoJob[];
  notes: BatchNote[];
}

/**
 * «Принять» строку ленты: ответ задачи и свежая карточка с сервера → разбор → запись с выбором по умолчанию (поля,
 * переводы, статус по уверенности; новый бренд по умолчанию не отмечен) в журнале применений → исход задачи.
 */
export async function acceptRow(row: AiBatchRow, opts: { schema: CardSchema | undefined; brands: readonly string[] | undefined; replace: boolean }): Promise<RowAccepted> {
  const [job, found] = await Promise.all([aiApi.job(row.id), cardsApi.export("all", [row.subjectId])]);
  const plan = planOf(job, found[0] ?? null, opts.schema, undefined, opts.brands);
  if (!plan) throw new Error("Ответ ИИ не разобрался: откройте «Править»");
  const write = () => writeCard(plan.review, plan.item.id, plan.selected, { translations: true, markReady: true, replace: opts.replace });
  const { value, applied } = await inApplyLog(job.id, "SINGLE", write);
  await aiApi.outcome(job.id, outcomeCounts(plan.rows, plan.selected));
  const { id: productId, title } = plan.item;
  return {
    applyId: applied.id,
    title,
    photos: defaultPhotos(plan.review).map((url) => ({ productId, title, url })),
    notes: notesOf(value, job.id, productId),
  };
}

/** Одна карточка «безопасно»: сервер снимает значения до записи и сверяет после; нарушение он возвращает сам. */
export async function applySafe(plan: JobPlan): Promise<AiSafeApplied> {
  const keys = new Set(safeKeysOf(plan));
  const { applied } = await inApplyLog(plan.job.id, "SAFE", async () => {
    await writeCard(plan.review, plan.item.id, keys, { translations: false, markReady: false });
    await aiApi.outcome(plan.job.id, outcomeCounts(plan.rows, keys));
  });
  return applied;
}
