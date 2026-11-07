/**
 * «Перевести с ИИ (N)»: строки списка → части для пакета и итог пакета словами экрана. Чистая логика без React.
 *
 * Промпт и разбор ответа те же, что у ручного пути (`prompt.ts`, `parse.ts`): одна часть годится и для встроенного
 * ИИ (сервер сам читает ответ и пишет черновики «ИИ»), и для ChatGPT вручную. Фича «ИИ» зовёт этот адаптер, а не
 * наоборот: сама она ни переводы, ни карточки не знает.
 */
import type { AiBatch } from "@/features/ai";
import { aboutDuration } from "@/features/ai";
import { parseAnswer } from "./parse";
import { plural } from "./plural";
import { buildPrompt, KIND_LABEL, PART_MAX_STRINGS, splitIntoParts, type PromptLangs, type PromptString } from "./prompt";
import type { UniqueString } from "./workset";

/** Одна часть: номер на экране, промпт и сколько в нём строк. */
export interface BatchPart {
  part: number;
  prompt: string;
  strings: number;
}

/** Бенчмарк сервера для части (`AiEstimate`): 30 секунд на часть. */
const SECONDS_PER_PART = 30;

function promptStrings(strings: readonly UniqueString[]): PromptString[] {
  return strings.map((s) => ({ id: s.id, kind: KIND_LABEL[s.kindKey] ?? s.kindKey, product: s.product, ru: s.source }));
}

/** Части по размеру и числу строк (≤ 60, как на ручном пути); порядок списка сохраняется. */
export function buildBatchParts(strings: readonly UniqueString[], langs?: PromptLangs): BatchPart[] {
  const split = splitIntoParts(promptStrings(strings));
  return split.map((p, i) => ({ part: i + 1, prompt: buildPrompt(p, i + 1, split.length, langs), strings: p.length }));
}

/** Адаптер предмета для пакета ИИ и для ручного мастера: промпт частями, разбор ответа, идентификаторы строк. */
export const translationAdapter = {
  buildPrompt: buildBatchParts,
  parseAnswer,
  subjects: (strings: readonly UniqueString[]): string[] => strings.map((s) => s.id),
};

/** «3 части по 60 строк · около 2 минут» — под кнопкой и в подтверждении. */
export function partsCaption(parts: readonly BatchPart[]): string {
  const n = parts.length;
  const total = parts.reduce((s, p) => s + p.strings, 0);
  const size = parts.reduce((m, p) => Math.max(m, p.strings), 0);
  const what =
    n === 1 ? `${total} ${plural(total, "строка", "строки", "строк")}` : `${n} ${plural(n, "часть", "части", "частей")} по ${Math.min(size, PART_MAX_STRINGS)} строк`;
  return `${what} · ${aboutDuration(n * SECONDS_PER_PART)}`;
}

export interface BatchResult {
  /** Мест × языков, куда записан черновик ИИ. */
  applied: number;
  /** Не записано: нет в ответе, не прошло проверку, оригинал успел измениться. */
  rejected: number;
  /** Не заменены ручные переводы (устаревшие, но написанные человеком). */
  ignored: number;
  /** Частей, которые не получились целиком (сбой, ответ не разобрался). */
  failedParts: number;
  /** Пакет закончился (не идёт и не на паузе). */
  finished: boolean;
}

/** Итог пакета переводов: числа задач складываются из исходов сервера. */
export function batchResult(b: AiBatch): BatchResult {
  const sum = (pick: (r: AiBatch["jobs"][number]) => number) => b.jobs.reduce((s, r) => s + pick(r), 0);
  return {
    applied: sum((r) => r.applied),
    rejected: sum((r) => r.rejected),
    ignored: sum((r) => r.ignored),
    failedParts: b.failed + b.badAnswer,
    finished: b.status !== "RUNNING" && b.status !== "PAUSED",
  };
}

/** «79 новых · 5 не заменены (ручные) · 0 ошибок»; сбойные части — отдельным словом. */
export function resultText(r: BatchResult): string {
  const parts = [
    `${r.applied} ${plural(r.applied, "новый", "новых", "новых")}`,
    `${r.ignored} не заменены (ручные)`,
    `${r.rejected} ${plural(r.rejected, "ошибка", "ошибки", "ошибок")}`,
  ];
  if (r.failedParts > 0) parts.push(`${r.failedParts} ${plural(r.failedParts, "часть не получилась", "части не получились", "частей не получились")}`);
  return parts.join(" · ");
}

/** Версия промпта пакета: пишется в задачу, чтобы по метрикам видеть, какой текст дал какой результат. */
export const TRANSLATION_PROMPT_VERSION = "translation-v2";
