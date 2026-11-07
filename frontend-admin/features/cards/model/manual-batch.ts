/**
 * Ручной пакет карточек по частям («часть 2 из 6») через ChatGPT. Пакет живёт на сервере (`ai_batches`, путь MANUAL):
 * товары и их отпечатки на старте, черновик экрана (текущая часть, вставленные ответы, размер части, модель) — поэтому
 * его продолжают после перезагрузки и с другого устройства. Ответ части разбирается здесь и уходит на сервер по товару:
 * каждый — отдельная задача «готово, ждёт проверки», дальше та же лента, что у пакета ИИ. Чистая логика.
 */
import { cardVersion } from "./ai-card";
import { assignCardIds, splitIntoBatches, type CardItem } from "./item";
import { parseCardAnswer, type ParsedCardAnswer } from "./parse";
import { buildCardReview } from "./review";
import { categoryPathName, type CardSchema } from "./schema";
import type { ProductReview } from "./types";

/** Товаров в части: на 4 ChatGPT отвечает целиком; 8 — быстрее, но ответ чаще обрывается. */
export const MANUAL_PART_SIZES = [4, 8] as const;
export type ManualPartSize = (typeof MANUAL_PART_SIZES)[number];
export const MANUAL_PART_SIZE: ManualPartSize = 4;

export type ManualStage = "parts" | "review";

/** Черновик экрана, который сервер хранит строкой. */
export interface ManualDraft {
  v: 2;
  size: ManualPartSize;
  /** Текущая часть, с нуля. */
  part: number;
  /** Вставленный текст по каждой части. */
  answers: string[];
  /** Какой текст части уже ушёл на сервер задачами: другой — отправить при уходе с части. */
  sent: string[];
  stage: ManualStage;
  /** Какая модель отвечала (необязательно): уходит в карточку как происхождение данных. */
  model: string;
  /** Товары сверх этого пакета (выбрано больше, чем помещается): «Следующий пакет» начнётся с них. */
  rest: string[];
}

export const isPartSize = (n: unknown): n is ManualPartSize => n === 4 || n === 8;

/** Товары пакета по категории и названию (без категории — в конце): соседние в части — похожие. */
export function sortForBatch(items: CardItem[], schema: CardSchema): CardItem[] {
  const key = new Map(items.map((it) => [it.id, `${categoryPathName(schema, it.categorySlug) || "я"}\u0000${it.title}`]));
  return [...items].sort((a, b) => key.get(a.id)!.localeCompare(key.get(b.id)!, "ru"));
}

export function partsOf<T>(ids: readonly T[], size: number): T[][] {
  return splitIntoBatches([...ids], size);
}

export function freshDraft(count: number, size: ManualPartSize = MANUAL_PART_SIZE, rest: string[] = []): ManualDraft {
  const empty = () => Array.from({ length: Math.max(1, Math.ceil(count / size)) }, () => "");
  return { v: 2, size, part: 0, answers: empty(), sent: empty(), stage: "parts", model: "", rest };
}

/**
 * Выбрано больше, чем помещается в один ручной пакет: сейчас — первые `max`, остальные ждут следующего пакета.
 * Почему не один большой: черновик хранит вставленный текст всех частей и пишется на сервер целиком при каждой
 * правке, а пакет на 100 товаров — это 25 частей, один присест работы.
 */
export function splitForManual(ids: readonly string[], max: number): { now: string[]; rest: string[]; batches: number } {
  return { now: ids.slice(0, max), rest: ids.slice(max), batches: Math.max(1, Math.ceil(ids.length / max)) };
}

function isStrings(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((s) => typeof s === "string");
}

function parse(raw: string): Partial<ManualDraft> | null {
  try {
    return JSON.parse(raw) as Partial<ManualDraft>;
  } catch {
    return null;
  }
}

/** Годен ли черновик для пакета из `count` товаров: та же версия, разбиение и часть в его пределах. */
function fits(d: Partial<ManualDraft> | null, count: number): d is ManualDraft {
  if (d?.v !== 2 || !isPartSize(d.size) || !isStrings(d.answers) || d.answers.length !== Math.ceil(count / d.size)) return false;
  return typeof d.part === "number" && d.part >= 0 && d.part < d.answers.length && (d.stage === "parts" || d.stage === "review");
}

/** Черновик с сервера; негодный (старая версия, другой размер списка) — новый, с размером части пакета. */
export function readDraft(raw: string | null | undefined, count: number, size: number): ManualDraft {
  const d = raw ? parse(raw) : null;
  const rest = d && isStrings(d.rest) ? d.rest : [];
  if (!fits(d, count)) return freshDraft(count, isPartSize(size) ? size : MANUAL_PART_SIZE, rest);
  const sent = isStrings(d.sent) && d.sent.length === d.answers.length ? d.sent : d.answers.map(() => "");
  return { ...d, sent, model: typeof d.model === "string" ? d.model : "", rest };
}

/** Другой размер части — только пока ничего не вставлено: ответы привязаны к частям. */
export function resize(d: ManualDraft, count: number, size: ManualPartSize): ManualDraft {
  return [...d.answers, ...d.sent].some((a) => a.trim()) ? d : { ...freshDraft(count, size, d.rest), model: d.model };
}

/** «Товары 5–8» (номера по порядку пакета). */
export function partRange(part: number, size: number, length: number): string {
  const from = part * size + 1;
  return length <= 1 ? `Товар ${from}` : `Товары ${from}–${from + length - 1}`;
}

export interface PartCheck {
  products: ProductReview[];
  errors: string[];
  notes: string[];
  /** Сколько товаров части получили годный ответ. */
  answered: number;
  size: number;
  /** Ответ по каждому товару с годным разбором — то, что уходит на сервер задачей. */
  perProduct: Map<string, string>;
}

/** Запись ответа одним блоком для одного товара: под его собственным id, с моделью, если в записи её нет. */
function singleAnswer(productId: string, raw: unknown, model: string): string {
  const entry = model.trim() && raw && typeof raw === "object" && !("model" in raw) ? { ...(raw as object), model: model.trim() } : raw;
  const id = assignCardIds([productId]).get(productId) ?? productId;
  return "```json\n" + JSON.stringify({ [id]: entry }, null, 2) + "\n```";
}

function perProductOf(parsed: ParsedCardAnswer, products: ProductReview[], ctx: Parameters<typeof buildCardReview>[1], model: string) {
  const good = new Set(products.map((p) => p.item.id));
  const out = new Map<string, string>();
  parsed.entries.forEach((raw, id) => {
    const one = buildCardReview({ ...parsed, entries: new Map([[id, raw]]), duplicates: new Set() }, ctx).products[0];
    if (one && good.has(one.item.id) && !out.has(one.item.id)) out.set(one.item.id, singleAnswer(one.item.id, raw, model));
  });
  return out;
}

/**
 * Ответ одной части → разбор по её товарам. Товары из других частей не принимаются: ответ, вставленный не в ту
 * часть, лучше заметить сразу, чем записать не туда. `ids` — ответные id всего пакета (`assignCardIds`).
 */
export function checkPart(answer: string, items: readonly CardItem[], size: number, schema: CardSchema, ids: Map<string, string>, model = ""): PartCheck {
  const parsed = parseCardAnswer(answer);
  const errors = [...parsed.errors];
  const empty = { products: [], notes: parsed.notes, answered: 0, size, perProduct: new Map<string, string>() };
  if (!answer.trim() || parsed.entries.size === 0) return { ...empty, errors: answer.trim() ? errors : [] };
  const ctx = { schema, items: [...items], ids };
  const r = buildCardReview(parsed, ctx);
  if (r.unknown.length) errors.push(`В ответе товары не из этой части (${r.unknown.join(", ")}) — пропущены. Проверьте, что ответ от этой части.`);
  for (const x of r.invalid) errors.push(`${x.id}: ${x.problems.join("; ")}`);
  return { products: r.products, errors, notes: parsed.notes, answered: r.products.length, size, perProduct: perProductOf(parsed, r.products, ctx, model) };
}

/** Что уходит на сервер по части: ответ каждого разобранного товара с отпечатком его карточки на старте пакета. */
export function partAnswers(check: PartCheck, versions: ReadonlyMap<string, string>, items: readonly CardItem[]) {
  const byId = new Map(items.map((i) => [i.id, i]));
  return [...check.perProduct].map(([productId, answer]) => {
    const item = byId.get(productId);
    return { productId, answer, subjectVersion: versions.get(productId) ?? (item ? cardVersion(item) : "") };
  });
}

/** «часть 2 из 6, вставлено 1 из 4» — строка возврата к пакету. */
export function progressText(d: Pick<ManualDraft, "part" | "answers">, answered: number, size: number): string {
  return `часть ${d.part + 1} из ${d.answers.length}, вставлено ${answered} из ${size}`;
}

/** Задача пакета глазами черновика: чей ответ, готов ли, решён ли. */
export interface ManualJobView {
  subjectId: string;
  status: string;
  outcome?: string | null;
}

/**
 * Сколько карточек ждёт проверки: по отправленным частям — готовые нерешённые задачи, по изменённым после отправки —
 * то, что разобралось в новом тексте. Решённые (принятые, отклонённые) не возвращаются: сервер их не трогает.
 */
export function pendingCount(parts: readonly string[][], d: Pick<ManualDraft, "answers" | "sent">, checks: readonly (PartCheck | null)[], jobs: readonly ManualJobView[]): number {
  const decided = new Set(jobs.filter((j) => j.outcome).map((j) => j.subjectId));
  const ready = new Set(jobs.filter((j) => j.status === "DONE" && !j.outcome).map((j) => j.subjectId));
  let n = 0;
  parts.forEach((ids, i) => {
    const fresh = d.answers[i] !== d.sent[i];
    n += ids.filter((id) => !decided.has(id) && (fresh ? checks[i]?.perProduct.has(id) === true : ready.has(id))).length;
  });
  return n;
}

/** Товары пакета, по которым на сервере нет ни одного ответа. */
export const unansweredOf = (order: readonly string[], jobs: readonly ManualJobView[]): string[] => {
  const has = new Set(jobs.map((j) => j.subjectId));
  return order.filter((id) => !has.has(id));
};

/** Тот же набор товаров в любом порядке — продолжаем тот же пакет, а не начинаем новый. */
export function sameProducts(a: readonly string[], b: readonly string[]): boolean {
  const x = new Set(a);
  return x.size === new Set(b).size && b.every((id) => x.has(id));
}

/** Строка полосы «Продолжить»: «часть 2 из 6, вставлено 1 из 4» или «проверка, осталось 5» — по серверу. */
export function resumeText(raw: string | null | undefined, order: readonly string[], partSize: number, jobs: readonly ManualJobView[]): string {
  const d = readDraft(raw, order.length, partSize);
  if (d.stage === "review") return `проверка, осталось ${jobs.filter((j) => j.status === "DONE" && !j.outcome).length}`;
  const part = partsOf(order, d.size)[d.part] ?? [];
  const has = new Set(jobs.map((j) => j.subjectId));
  return progressText(d, part.filter((id) => has.has(id)).length, part.length);
}
