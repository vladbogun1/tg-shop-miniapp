import { nowMs } from "@shop/core/time";
import type { BatchStatus, BatchSummary, Distribution, EtaMode, SubStatus } from "./types";

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  ORDERED: "Заказана",
  IN_TRANSIT: "В пути",
  CUSTOMS: "На таможне",
  ARRIVED: "Приехала",
  CANCELLED: "Отменена",
};
export const BATCH_STATUS_TONE: Record<BatchStatus, Tone> = {
  ORDERED: "neutral",
  IN_TRANSIT: "info",
  CUSTOMS: "warn",
  ARRIVED: "ok",
  CANCELLED: "danger",
};
export const isOpenStatus = (s: string) => s === "ORDERED" || s === "IN_TRANSIT" || s === "CUSTOMS";

export const ETA_MODES: { value: EtaMode; label: string }[] = [
  { value: "DATE", label: "Дата" },
  { value: "RANGE", label: "Диапазон" },
  { value: "APPROX", label: "Примерно" },
  { value: "HIDDEN", label: "Не показывать" },
];
export const DISTRIBUTIONS: { value: Distribution; label: string }[] = [
  { value: "QUEUE_HOLD", label: "Очередь с бронью" },
  { value: "ALL_AT_ONCE", label: "Всем сразу" },
];
export const CURRENCIES = ["USD", "EUR", "CNY", "PLN", "UAH"] as const;

export const SUB_STATUS_LABEL: Record<SubStatus, string> = {
  WAITING: "Ждёт",
  HELD: "Бронь",
  NOTIFIED: "Уведомлён",
  BOUGHT: "Купил",
  EXPIRED: "Бронь сгорела",
  CANCELLED: "Вышел",
};
export const SUB_STATUS_TONE: Record<SubStatus, Tone> = {
  WAITING: "info",
  HELD: "accent",
  NOTIFIED: "warn",
  BOUGHT: "ok",
  EXPIRED: "danger",
  CANCELLED: "neutral",
};
export const isLiveSub = (s: SubStatus) => s === "WAITING" || s === "HELD" || s === "NOTIFIED";

export function sourceLabel(s: string | null | undefined): string {
  const v = (s ?? "").toUpperCase();
  if (v === "WEB" || v === "SITE") return "сайт";
  if (v === "MINIAPP" || v === "MINI_APP" || v === "TG") return "Mini App";
  return s ?? "—";
}

export function lineTitle(title: string, variantName: string | null | undefined): string {
  return variantName ? `${title} · ${variantName}` : title;
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
/** «2026-11-20» → «20 ноября» (год — только если не текущий). */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const cur = new Date(nowMs()).getFullYear();
  return `${d} ${MONTHS[m - 1]}${y !== cur ? ` ${y}` : ""}`;
}

/** Whole weeks from today to a target date, rounded up; 0 once it has come. */
export function weeksUntil(target: string | null | undefined): number {
  if (!target) return 0;
  const t = new Date(`${target}T00:00:00`);
  const now = new Date(nowMs());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((t.getTime() - today.getTime()) / 86_400_000);
  return days <= 0 ? 0 : Math.ceil(days / 7);
}

/** Local «YYYY-MM-DD» for today + N days. */
export function isoInDays(days: number): string {
  const d = new Date(nowMs());
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Срок так, как его видит Максим (покупатель увидит «~N тижнів» от сегодняшнего дня). */
export function etaText(b: Pick<BatchSummary, "etaMode" | "etaFrom" | "etaTo">): string {
  switch (b.etaMode) {
    case "DATE":
      return b.etaFrom ? fmtDay(b.etaFrom) : "—";
    case "RANGE":
      return b.etaFrom && b.etaTo ? `${fmtDay(b.etaFrom)} — ${fmtDay(b.etaTo)}` : "—";
    case "APPROX": {
      const w = weeksUntil(b.etaTo);
      return w > 0 ? `~${w} нед. (к ${fmtDay(b.etaTo)})` : "скоро";
    }
    default:
      return "не показываем";
  }
}

/** Центы валюты → «95.00» (для поля ввода). */
export function fxToInput(v: number | null | undefined): string {
  return v == null ? "" : (v / 100).toFixed(2);
}
/** «95,5» → 9550; пусто → null. */
export function inputToFx(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Закупка в гривнах за штуку (копейки): центы валюты × курс. */
export function costUahMinor(unitFx: number | null | undefined, rate: number | null | undefined): number | null {
  if (unitFx == null || rate == null || rate <= 0) return null;
  return Math.round(unitFx * rate);
}
