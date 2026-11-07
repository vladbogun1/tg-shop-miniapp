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

/** Опрос идущей задачи: раз в 4 с, пока вкладка видна; в фоне раз в минуту; у законченной опрос выключен. */
export const JOB_POLL_MS = 4000;
export const JOB_POLL_HIDDEN_MS = 60_000;

export function pollInterval(job: Pick<AiJob, "status"> | undefined, visible = true): number | false {
  if (!job || !isActive(job.status)) return false;
  return visible ? JOB_POLL_MS : JOB_POLL_HIDDEN_MS;
}

/** Статусы глазами админа (дизайн 2.7): слов «DONE/EMPTY» и «ходы» он не видит. */
export type ReviewState = "running" | "review" | "applied" | "rejected" | "nodata" | "failed" | "canceled";

const REVIEW_LABEL: Record<ReviewState, string> = {
  running: "Идёт",
  review: "Проверить",
  applied: "Применено",
  rejected: "Отклонено",
  nodata: "Не нашёл данных",
  failed: "Сбой",
  canceled: "Отменена",
};

export function reviewState(job: Pick<AiJob, "status" | "outcome">): ReviewState {
  switch (job.status) {
    case "QUEUED":
    case "RUNNING":
      return "running";
    case "DONE":
      if (!job.outcome) return "review";
      return job.outcome === "REJECTED" ? "rejected" : "applied";
    case "EMPTY":
      return "nodata";
    case "CANCELED":
      return "canceled";
    default:
      return "failed";
  }
}

export function reviewStateLabel(state: ReviewState): string {
  return REVIEW_LABEL[state];
}

/** Задача идёт дольше обычного: подсказка «Это дольше обычного». */
export const SLOW_AFTER_MS = 180_000;

export function isSlow(createdAt: string | null | undefined, nowMs: number): boolean {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(t) && nowMs - t > SLOW_AFTER_MS;
}

/** «1:05» — таймер хода работы. */
export function elapsedClock(createdAt: string | null | undefined, nowMs: number): string {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  const sec = Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t) / 1000)) : 0;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
