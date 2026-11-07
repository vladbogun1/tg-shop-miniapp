/**
 * Ручной пакет карточек по частям («часть 2 из 6»): запасной путь, когда встроенный ИИ на паузе, выключен или не
 * справился. Товары режутся на части по 4, на каждую — свой промпт для ChatGPT; ответ части разбирается сразу.
 * Черновик (порядок товаров, отпечатки карточек на момент начала, вставленные ответы, уже принятые) лежит в
 * localStorage через `core/storage` и переживает перезагрузку. Один черновик на браузер: новый пакет заменяет старый.
 */
import { localStore } from "@shop/core/storage";
import { cardVersion } from "./ai-card";
import { splitIntoBatches, type CardItem } from "./item";
import { parseCardAnswer } from "./parse";
import { buildCardReview } from "./review";
import type { CardSchema } from "./schema";
import type { ProductReview } from "./types";

/** Товаров в части: промпт на 4 карточки ChatGPT отрабатывает целиком, без «продолжи». */
export const MANUAL_PART_SIZE = 4;
const KEY = "cards-manual-batch-v1";

export type ManualStage = "parts" | "review";

export interface ManualDraft {
  v: 1;
  /** Товары в порядке промптов. */
  ids: string[];
  /** Отпечаток карточки на момент начала: правки после него — конфликт в проверке. */
  versions: Record<string, string>;
  /** Текущая часть, с нуля. */
  part: number;
  /** Вставленный ответ по каждой части. */
  answers: string[];
  /** Товары, уже записанные из этого пакета. */
  done: string[];
  stage: ManualStage;
}

export function partsOf(ids: readonly string[]): string[][] {
  return splitIntoBatches([...ids], MANUAL_PART_SIZE);
}

/** Новый черновик по товарам в нужном порядке (сначала по категории — меньше схемы в промпте). */
export function newDraft(items: readonly CardItem[]): ManualDraft {
  const ids = items.map((i) => i.id);
  return {
    v: 1,
    ids,
    versions: Object.fromEntries(items.map((i) => [i.id, cardVersion(i)])),
    part: 0,
    answers: partsOf(ids).map(() => ""),
    done: [],
    stage: "parts",
  };
}

/** Тот же набор товаров (порядок не важен): открыть его снова — значит продолжить черновик. */
export function sameIds(d: ManualDraft, ids: readonly string[]): boolean {
  const set = new Set(ids);
  return set.size === d.ids.length && d.ids.every((id) => set.has(id));
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((s) => typeof s === "string");
}

/** Черновик из хранилища целиком годный: иначе (старая версия, ручная правка) его не открываем. */
export function isDraft(x: unknown): x is ManualDraft {
  if (!x || typeof x !== "object") return false;
  const d = x as Partial<ManualDraft>;
  return (
    d.v === 1 &&
    isStringArray(d.ids) &&
    d.ids.length > 0 &&
    isStringArray(d.answers) &&
    d.answers.length === partsOf(d.ids).length &&
    isStringArray(d.done) &&
    typeof d.part === "number" &&
    d.part >= 0 &&
    d.part < d.answers.length &&
    (d.stage === "parts" || d.stage === "review") &&
    !!d.versions &&
    typeof d.versions === "object"
  );
}

export function loadDraft(): ManualDraft | null {
  const raw = localStore.getJson<unknown>(KEY);
  return isDraft(raw) ? raw : null;
}

/** `false` — браузер не дал сохранить (приватный режим, квота): пакет работает, но перезагрузку не переживёт. */
export const saveDraft = (d: ManualDraft): boolean => localStore.setJson(KEY, d);
export const clearDraft = (): void => localStore.removeItem(KEY);

/** «Товары 5–8» (номера по порядку пакета). */
export function partRange(d: Pick<ManualDraft, "ids">, part: number): string {
  const size = partsOf(d.ids)[part]?.length ?? 0;
  const from = part * MANUAL_PART_SIZE + 1;
  return size <= 1 ? `Товар ${from}` : `Товары ${from}–${from + size - 1}`;
}

export interface PartCheck {
  products: ProductReview[];
  errors: string[];
  notes: string[];
  /** Сколько товаров части получили годный ответ. */
  answered: number;
  size: number;
}

/**
 * Ответ одной части → разбор по её товарам. Товары из других частей не принимаются: ответ, вставленный не в ту
 * часть, лучше заметить сразу, чем записать не туда. `ids` — ответные id всего пакета (`assignCardIds`).
 */
export function checkPart(answer: string, items: readonly CardItem[], size: number, schema: CardSchema, ids: Map<string, string>): PartCheck {
  const parsed = parseCardAnswer(answer);
  const errors = [...parsed.errors];
  if (!answer.trim() || parsed.entries.size === 0) return { products: [], errors: answer.trim() ? errors : [], notes: parsed.notes, answered: 0, size };
  const r = buildCardReview(parsed, { schema, items: [...items], ids });
  if (r.unknown.length) errors.push(`В ответе товары не из этой части (${r.unknown.join(", ")}) — пропущены. Проверьте, что ответ от этой части.`);
  for (const x of r.invalid) errors.push(`${x.id}: ${x.problems.join("; ")}`);
  return { products: r.products, errors, notes: parsed.notes, answered: r.products.length, size };
}

/** «часть 2 из 6, вставлено 1 из 4» — строка возврата к черновику. */
export function progressText(d: Pick<ManualDraft, "part" | "answers">, answered: number, size: number): string {
  return `часть ${d.part + 1} из ${d.answers.length}, вставлено ${answered} из ${size}`;
}

/** Карточку правили после начала пакета (или она пропала из черновика): ответ мог устареть. */
export function changedSince(d: Pick<ManualDraft, "versions">, item: CardItem): boolean {
  const was = d.versions[item.id];
  return !!was && was !== cardVersion(item);
}

/** Что ещё ждёт проверки: разобранные товары всех частей минус уже записанные. */
export function pendingReviews(checks: readonly PartCheck[], done: readonly string[]): ProductReview[] {
  const finished = new Set(done);
  return checks.flatMap((c) => c.products).filter((p) => !finished.has(p.item.id));
}

/** Товары без годного ответа после всех частей — их можно вернуть в части или оставить. */
export function unanswered(d: Pick<ManualDraft, "ids">, checks: readonly PartCheck[]): string[] {
  const got = new Set(checks.flatMap((c) => c.products.map((p) => p.item.id)));
  return d.ids.filter((id) => !got.has(id));
}
