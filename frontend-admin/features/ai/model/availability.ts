import type { AiFeature, AiSummary } from "../api";

/** Почему встроенным ИИ сейчас нельзя пользоваться; `null` — можно. */
export type Unavailable = "not-configured" | "disabled" | "feature-off" | "limit-day" | "limit-month" | "no-connection";

/**
 * Сводка → причина недоступности для функции. Без сводки (ещё грузится или нет связи) решает `failed`:
 * при сбое запроса ручной путь выдвигается вперёд, пока же идёт загрузка — кнопки не мигают (`undefined`).
 */
export function unavailableReason(summary: AiSummary | undefined, feature: AiFeature, failed = false): Unavailable | null | undefined {
  if (!summary) return failed ? "no-connection" : undefined;
  if (!summary.configured) return "not-configured";
  if (!summary.enabled) return "disabled";
  if (!summary.featuresOn.includes(feature)) return "feature-off";
  if (summary.limit === "MONTH") return "limit-month";
  if (summary.limit === "DAY") return "limit-day";
  return null;
}

/** «около минуты», «около 3 минут» из секунд оценки (без истории сервер даёт грубое значение). */
export function aboutDuration(seconds: number): string {
  if (seconds <= 75) return "около минуты";
  const min = Math.round(seconds / 60);
  const m10 = min % 10;
  const m100 = min % 100;
  const word = m10 === 1 && m100 !== 11 ? "минуты" : "минут";
  return `около ${min} ${word}`;
}
