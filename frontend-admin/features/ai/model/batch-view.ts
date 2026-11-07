/**
 * Пакет ИИ глазами экрана: строка «Идёт пакет: 12 из 30», причина паузы, итог «Готово · Не нашёл данных · Сбой»,
 * текст подтверждения (деньги только финансисту), срок отмены применения. Чистая логика, без React.
 */
import { toPercent } from "@shop/core/percent";
import { uahFromMinor } from "./format";
import type { AiBatch, AiBatchEstimate, AiBatchPause, AiSafeApplied } from "../api-batch";

const MIN_MS = 60_000;
const MIN_PER_HOUR = 60;

/** Сколько задач пакета уже закончилось (любым исходом). */
export function finishedCount(b: Pick<AiBatch, "total" | "queued" | "running">): number {
  return Math.max(0, b.total - b.queued - b.running);
}

const PAUSE_TEXT: Record<AiBatchPause, string> = {
  LIMIT_DAY: "Дневной лимит исчерпан",
  LIMIT_MONTH: "Месячный лимит исчерпан",
  RESTART: "Сервис перезапускался",
  FAILURES: "Три сбоя подряд",
  SEARCH_DOWN: "Поиск в интернете не отвечает",
  MANUAL: "Остановлено вручную",
  DISABLED: "ИИ или пакеты выключены владельцем",
};

export function pauseText(reason: AiBatch["pauseReason"] | undefined): string {
  return reason ? PAUSE_TEXT[reason] : "Пауза";
}

/** Доля законченных, 0…100, для полоски хода. */
export function progressPercent(b: Pick<AiBatch, "total" | "queued" | "running">): number {
  return b.total > 0 ? Math.round(toPercent(finishedCount(b) / b.total)) : 0;
}

/** Строка в полосе: идёт или стоит. */
export function barText(b: AiBatch): string {
  const n = `${finishedCount(b)} из ${b.total}`;
  return b.status === "PAUSED" ? `Пауза: ${n} · ${pauseText(b.pauseReason)}` : `Идёт пакет: ${n}`;
}

export const isOpen = (b: AiBatch): boolean => b.status === "RUNNING" || b.status === "PAUSED";

/** «Продолжить» есть после паузы, кроме выключенного владельцем ИИ (сервер всё равно не пустит). */
export const canResume = (b: AiBatch): boolean => b.status === "PAUSED" && b.pauseReason !== "DISABLED";

export interface SummaryPart {
  label: string;
  n: number;
  tone: "ok" | "muted" | "bad";
}

/** «Готово N · Не нашёл данных N · Сбой N»: нулевые части не показываем. */
export function summaryParts(b: AiBatch): SummaryPart[] {
  const parts: SummaryPart[] = [
    { label: "Готово", n: b.done, tone: "ok" },
    { label: "Не нашёл данных", n: b.empty, tone: "muted" },
    { label: "Сбой", n: b.failed + b.badAnswer, tone: "bad" },
  ];
  return parts.filter((p) => p.n > 0);
}

/** Задачи, которые встроенный ИИ не сделал и сам уже не сделает (стоят в паузе, сбой, пусто, отменены): их оформляют вручную. */
const LEFT_FOR_MANUAL = new Set<string>(["QUEUED", "EMPTY", "BAD_ANSWER", "FAILED", "CANCELED"]);

/** Предметы задач для ручного пути; у идущего пакета — ничего (очередь ещё разберёт ИИ). */
export function manualSubjects(b: Pick<AiBatch, "status" | "jobs">): string[] {
  if (b.status === "RUNNING") return [];
  return b.jobs.filter((j) => LEFT_FOR_MANUAL.has(j.status)).map((j) => j.subjectId);
}

export const summaryText = (b: AiBatch): string => summaryParts(b).map((p) => `${p.label} ${p.n}`).join(" · ");

export function minutesText(minutes: number): string {
  if (minutes < 1) return "меньше минуты";
  if (minutes < MIN_PER_HOUR) return `около ${minutes} мин`;
  const h = Math.floor(minutes / MIN_PER_HOUR);
  const m = minutes % MIN_PER_HOUR;
  return m === 0 ? `около ${h} ч` : `около ${h} ч ${m} мин`;
}

/** Диапазон «от — до» в гривнах; одинаковые края — одно число. */
export function moneyRange(p50Minor: number, p90Minor: number): string {
  return p90Minor <= p50Minor ? uahFromMinor(p50Minor) : `${uahFromMinor(p50Minor)} – ${uahFromMinor(p90Minor)}`;
}

export interface ConfirmView {
  /** Всем: сколько и сколько ждать. */
  lead: string;
  /** Только финансисту: деньги и «хватит ли лимита». */
  money: string | null;
  /** Не хватает лимита: пакет встанет на паузу сам. */
  warn: string | null;
}

export function confirmView(count: number, est: AiBatchEstimate | undefined, finance: boolean, noun = "карточек"): ConfirmView {
  const lead = est ? `${count} ${noun} · ${minutesText(est.minutes)}` : `${count} ${noun}`;
  if (!finance || !est) return { lead, money: null, warn: null };
  const money = `Примерно ${moneyRange(est.p50Minor, est.p90Minor)}, свободно в лимите ${uahFromMinor(Math.max(0, est.roomMinor))}`;
  return { lead, money, warn: est.fits ? null : "Лимита не хватит на весь пакет: он встанет на паузу, когда лимит кончится." };
}

/** Сколько ещё можно отменить применение: «23 ч», «40 мин»; null — срок вышел. */
export function undoLeft(until: string | undefined, nowMs: number): string | null {
  if (!until) return null;
  const left = Date.parse(until) - nowMs;
  if (!Number.isFinite(left) || left <= 0) return null;
  const minutes = Math.ceil(left / MIN_MS);
  return minutes >= MIN_PER_HOUR ? `${Math.floor(minutes / MIN_PER_HOUR)} ч` : `${minutes} мин`;
}

export interface SafeTotals {
  cards: number;
  fields: number;
  /** Карточки, где что-то вышло за «безопасное» и было возвращено. */
  reverted: number;
}

/** Точные числа для окна «Принять безопасное»: сколько карточек и полей записано и что вернули назад. */
export function safeTotals(applied: readonly AiSafeApplied[]): SafeTotals {
  return {
    cards: applied.filter((a) => a.changed.length > 0).length,
    fields: applied.reduce((s, a) => s + a.changed.length, 0),
    reverted: applied.filter((a) => a.notSafe.length > 0).length,
  };
}

/** Что считается безопасным на экране: только пустая характеристика или пустое описание (сервер проверяет то же). */
export function isSafeKey(key: string): boolean {
  return key.startsWith("spec:") || key === "description";
}
