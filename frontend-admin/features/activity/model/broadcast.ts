import { sharePercent } from "./percent";
import type { Tone } from "./tone";
import type { BroadcastSummary } from "./types";

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Все",
  active: "С заказами",
  inactive: "Без заказов",
  premium: "Premium",
};

export function audienceLabel(audience: string): string {
  return AUDIENCE_LABEL[audience] ?? audience;
}

export function broadcastStatus(status: string): { label: string; tone: Tone } {
  if (status === "RUNNING") return { label: "Идёт", tone: "info" };
  if (status === "INTERRUPTED") return { label: "Прервана", tone: "warn" };
  return { label: "Завершена", tone: "neutral" };
}

export interface BroadcastNumbers {
  /** Сколько получателей есть в журнале (0 — рассылка до появления журнала). */
  journaled: number;
  delivered: number;
  notDelivered: number;
  pctOk: number;
  pctBad: number;
  /** Причины недоставки, по убыванию. */
  reasons: [string, number][];
  /** Текст рассылки без HTML-тегов, в одну строку. */
  preview: string;
}

/** Цифры карточки рассылки. Старые рассылки знают только счётчики таблицы broadcasts. */
export function broadcastNumbers(s: BroadcastSummary): BroadcastNumbers {
  const b = s.broadcast;
  const journaled = s.delivered + s.failed + s.skipped;
  const delivered = journaled > 0 ? s.delivered : b.sent;
  const notDelivered = journaled > 0 ? s.failed + s.skipped : b.failed + b.blocked;
  const total = Math.max(b.total, delivered + notDelivered, 1);
  return {
    journaled,
    delivered,
    notDelivered,
    pctOk: sharePercent(delivered, total),
    pctBad: sharePercent(notDelivered, total),
    reasons: Object.entries(s.reasons).sort((a, c) => c[1] - a[1]),
    preview: b.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  };
}
