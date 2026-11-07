import type { AiJob, AiJobStatus } from "../api";

/** Состояния задачи ИИ для экранов: подписи, оттенок бейджа, что можно сделать. Чистая логика, без React. */
export type AiTone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

const ACTIVE: ReadonlySet<AiJobStatus> = new Set<AiJobStatus>(["QUEUED", "RUNNING"]);

const LABEL: Record<AiJobStatus, string> = {
  QUEUED: "В очереди",
  RUNNING: "Работает",
  DONE: "Готово",
  EMPTY: "Пусто",
  BAD_ANSWER: "Ответ не разобран",
  FAILED: "Сбой",
  CANCELED: "Остановлено",
};

const TONE: Record<AiJobStatus, AiTone> = {
  QUEUED: "neutral",
  RUNNING: "accent",
  DONE: "ok",
  EMPTY: "warn",
  BAD_ANSWER: "warn",
  FAILED: "danger",
  CANCELED: "neutral",
};

/** Задача ещё идёт: её можно остановить, а экран должен опрашивать её состояние. */
export function isActive(status: AiJobStatus): boolean {
  return ACTIVE.has(status);
}

export function statusLabel(status: AiJobStatus): string {
  return LABEL[status];
}

export function statusTone(status: AiJobStatus): AiTone {
  return TONE[status];
}

/** Итог есть, но результата для карточки нет: стоит предложить «Попробовать внимательнее». */
export function isDisappointing(status: AiJobStatus): boolean {
  return status === "EMPTY" || status === "BAD_ANSWER" || status === "FAILED";
}

/** «Остановить» имеет смысл, пока задача идёт и остановка ещё не запрошена. */
export function canCancel(job: Pick<AiJob, "status" | "cancelRequested">): boolean {
  return isActive(job.status) && !job.cancelRequested;
}

/** «Попробовать внимательнее» — только после неудачного итога (повтор активной задачи сервер отклонит). */
export function canRetry(job: Pick<AiJob, "status">): boolean {
  return isDisappointing(job.status) || job.status === "CANCELED";
}

/** Опрос идущей задачи: раз в две секунды, пока она работает; у законченной опрос выключен. */
export const JOB_POLL_MS = 2000;

export function pollInterval(job: Pick<AiJob, "status"> | undefined): number | false {
  return job && isActive(job.status) ? JOB_POLL_MS : false;
}
