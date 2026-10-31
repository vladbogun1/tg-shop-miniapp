/** Периоды и каналы страницы метрик: варианты выбора, подписи сравнения, проверка сохранённого значения. */
import { dayInZone } from "@shop/core/time";
import type { Channel, PeriodParams, PeriodToken } from "./types";

export const DEFAULT_PERIOD: PeriodParams = { period: "month", channel: "all" };

export const PERIOD_OPTIONS: { value: PeriodToken; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "7d", label: "7 дн" },
  { value: "month", label: "Этот месяц" },
  { value: "prevmonth", label: "Прошлый месяц" },
  { value: "90d", label: "90 дн" },
  { value: "year", label: "Год" },
  { value: "custom", label: "Свой" },
];

export const CHANNEL_OPTIONS: { value: Channel; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "miniapp", label: "Mini App" },
  { value: "web", label: "Сайт" },
];

/** What the comparison period is called next to a ▲▼ delta. */
export const PREV_LABEL: Record<PeriodToken, string> = {
  today: "к вчера на это время",
  "7d": "к прошлым 7 дням на это время",
  month: "к тем же дням прошлого месяца",
  prevmonth: "к позапрошлому месяцу",
  "90d": "к прошлым 90 дням на это время",
  year: "к тому же отрезку прошлого года",
  custom: "к такому же отрезку до",
};

export function isValid(v: unknown): v is PeriodParams {
  if (!v || typeof v !== "object") return false;
  const p = v as PeriodParams;
  return (
    PERIOD_OPTIONS.some((o) => o.value === p.period) &&
    CHANNEL_OPTIONS.some((o) => o.value === p.channel) &&
    (p.period !== "custom" || (!!p.from && !!p.to))
  );
}

/**
 * yyyy-MM-dd of today in Kyiv (for the custom range inputs). Deliberately NOT the browser's zone:
 * the backend cuts periods into Europe/Kyiv calendar days, so «today» here must be its «today»
 * (an admin abroad after midnight would otherwise ask for a day the server has not started).
 */
export function todayIso(): string {
  return dayInZone("Europe/Kyiv");
}

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Токен периода → [from, to] (yyyy-MM-dd, Киев). */
export function periodRange(p: PeriodParams): { from: string; to: string } {
  const today = todayIso();
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (p.period) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: shift(today, -6), to: today };
    case "90d":
      return { from: shift(today, -89), to: today };
    case "month":
      return { from: `${y}-${pad(m)}-01`, to: today };
    case "prevmonth": {
      const first = `${y}-${pad(m)}-01`;
      return { from: shift(first, -1).slice(0, 8) + "01", to: shift(first, -1) };
    }
    case "year":
      return { from: `${y}-01-01`, to: today };
    default:
      return { from: p.from ?? today, to: p.to ?? today };
  }
}
