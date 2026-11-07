import type { AiFeature, AiJob, AiTaskRow, AiTaskTab } from "../api";
import { reviewState, reviewStateLabel, statusTone, type AiTone, type ReviewState } from "./job-state";
import { activeStepText } from "./job-steps";

/** Центр ИИ-задач: вкладки, строки, подписи. Чистая логика, без React. */

export const TASK_TABS: { value: AiTaskTab; label: string }[] = [
  { value: "active", label: "Идут" },
  { value: "review", label: "Проверить" },
  { value: "problems", label: "Проблемы" },
  { value: "history", label: "История" },
];

const FEATURE_LABEL: Record<AiFeature, string> = {
  CARD: "Карточка",
  COMPLETION: "Дозаполнение",
  TRANSLATION: "Перевод",
  SUPPLY_EXTRACT: "Поставка: разбор накладной",
  SUPPLY_MATCH: "Поставка: сопоставление",
  SEARCH_TEST: "Проверка поиска",
};

export function featureLabel(feature: AiFeature): string {
  return FEATURE_LABEL[feature] ?? "Задача ИИ";
}

/** Результат старше двух недель не берём в счётчик «ждёт проверки»: он мог устареть. */
export const STALE_AFTER_DAYS = 14;
const DAY_MS = 86_400_000;

export function isStale(job: Pick<AiJob, "finishedAt" | "createdAt">, nowMs: number): boolean {
  const t = Date.parse(job.finishedAt || job.createdAt);
  return Number.isFinite(t) && nowMs - t > STALE_AFTER_DAYS * DAY_MS;
}

export interface TaskRowView {
  id: number;
  title: string;
  admin: string;
  state: ReviewState;
  stateLabel: string;
  tone: AiTone;
  /** Ждёт проверки дольше двух недель: показываем «может устареть». */
  stale: boolean;
  /** Куда вести: в ревью карточки, если результат ждёт проверки. */
  reviewHref: string | null;
  /** Сумма в копейках: только у финансиста, у остальных поля нет. */
  costMinor: number | null;
  when: string;
  /** Задача идёт: «шаг «Ищу в интернете»» или «в очереди» вместо времени; иначе null. */
  stepText: string | null;
}

export function taskTitle(row: Pick<AiTaskRow, "job" | "subjectLabel">): string {
  const what = featureLabel(row.job.feature);
  return row.subjectLabel ? `${what} · ${row.subjectLabel}` : what;
}

/** Ревью есть только у карточки с готовым ответом, который ещё не применили и не отклонили. */
export function reviewHref(job: Pick<AiJob, "id" | "feature" | "status" | "outcome">): string | null {
  return job.feature === "CARD" && reviewState(job) === "review" ? `/cards/ai-review/${job.id}` : null;
}

export function taskRowView(row: AiTaskRow, nowMs: number): TaskRowView {
  const state = reviewState(row.job);
  return {
    id: row.job.id,
    title: taskTitle(row),
    admin: row.adminName,
    state,
    stateLabel: reviewStateLabel(state),
    tone: state === "review" ? "accent" : statusTone(row.job.status),
    stale: state === "review" && isStale(row.job, nowMs),
    reviewHref: reviewHref(row.job),
    costMinor: row.job.costMinor ?? null,
    when: row.job.finishedAt || row.job.createdAt,
    stepText: activeStepText(row.job),
  };
}

const ERROR_TEXT: Record<string, string> = {
  RESTARTED: "Прервано перезапуском сервера, повторите запуск",
  MODEL_FAILED: "Модель не ответила",
  KEY_REJECTED: "Провайдер отклонил ключ",
};

/** Что случилось, человеческими словами: без кодов и названий провайдера. */
export function problemText(job: Pick<AiJob, "status" | "errorCode">): string {
  if (job.status === "EMPTY") return "ИИ не нашёл данных по товару";
  if (job.status === "BAD_ANSWER") return "Ответ ИИ не удалось разобрать";
  return (job.errorCode && ERROR_TEXT[job.errorCode]) || "Сбой при работе ИИ";
}

/** Пустая вкладка: что сказать (макет 09: «Задач пока нет · Запустите «Заполнить с ИИ» в карточке товара»). */
export const EMPTY_TEXT: Record<AiTaskTab, string> = {
  active: "Задач пока нет",
  review: "Нечего проверять",
  problems: "Проблем за неделю не было",
  history: "Задач ИИ пока не было",
};

/** Подсказка под пустой вкладкой, где задачу можно запустить; у «Проверить» и «Проблем» её нет. */
export const EMPTY_HINT: Partial<Record<AiTaskTab, string>> = {
  active: "Запустите «Заполнить с ИИ» в карточке товара.",
  history: "Запустите «Заполнить с ИИ» в карточке товара.",
};

/** Вкладка при входе (макет 06): «Проверить», если там что-то есть, иначе «Идут». */
export function defaultTab(review: number | undefined): AiTaskTab {
  return review && review > 0 ? "review" : "active";
}

export function tabCount(
  tab: AiTaskTab,
  counts: { active: number; review: number; problems: number } | undefined,
): number | undefined {
  if (!counts || tab === "history") return undefined;
  return counts[tab];
}
