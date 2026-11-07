/**
 * Ход задачи простыми словами: сервер пишет текущий шаг (`AiJobDto.step`: «Читаю задание», «Ищу: …»,
 * «Читаю страницу …», «Разбираю найденное», «Пишу ответ», «Исправляю ответ»), экран сводит его к трём этапам из
 * макета — «Читаю карточку» → «Ищу в интернете» → «Собираю ответ» — и показывает сам шаг строкой под ними.
 * Чистая логика.
 */
import { toPercent } from "@shop/core/percent";
import type { AiJob } from "../api";

export const STAGES = ["Читаю карточку", "Ищу в интернете", "Собираю ответ"] as const;
export type StageIndex = 0 | 1 | 2;

const RESEARCH = ["Ищу", "Читаю страницу", "Разбираю найденное"];
const ANSWER = ["Пишу ответ", "Исправляю ответ"];

/** Этап по шагу сервера; шага ещё нет — первый этап. */
export function stageOf(step: string | null | undefined): StageIndex {
  if (!step) return 0;
  if (ANSWER.some((p) => step.startsWith(p))) return 2;
  if (RESEARCH.some((p) => step.startsWith(p))) return 1;
  return 0;
}

/** Полоса хода: середина текущего этапа (точнее не знаем — число поисков заранее неизвестно). */
export function stagePercent(stage: StageIndex): number {
  return Math.round(toPercent((stage + 0.5) / STAGES.length));
}

/** Для строки «Идут» в центре задач: «шаг «Ищу в интернете»» / «в очереди». */
export function activeStepText(job: Pick<AiJob, "status" | "step">): string | null {
  if (job.status === "QUEUED") return "в очереди";
  if (job.status !== "RUNNING") return null;
  return `шаг «${STAGES[stageOf(job.step)]}»`;
}
