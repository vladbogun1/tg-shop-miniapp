/**
 * The metrics page's own period + channel, remembered per browser. It used to share
 * `tgshop_admin_range` with the orders board, so picking "Год" here changed the kanban filter.
 */
import { useEffect, useState } from "react";
import type { Channel, PeriodParams, PeriodToken } from "./api";

const KEY = "tgshop_admin_metrics_period";
const DEFAULT: PeriodParams = { period: "month", channel: "all" };

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

function isValid(v: unknown): v is PeriodParams {
  if (!v || typeof v !== "object") return false;
  const p = v as PeriodParams;
  return (
    PERIOD_OPTIONS.some((o) => o.value === p.period) &&
    CHANNEL_OPTIONS.some((o) => o.value === p.channel) &&
    (p.period !== "custom" || (!!p.from && !!p.to))
  );
}

export function useMetricsPeriod(): [PeriodParams, (p: PeriodParams) => void] {
  const [value, setValue] = useState<PeriodParams>(DEFAULT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValid(parsed)) setValue(parsed);
      }
    } catch {
      /* private mode / bad JSON: keep the default */
    }
  }, []);

  function update(p: PeriodParams) {
    setValue(p);
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* not worth surfacing */
    }
  }

  return [value, update];
}

/**
 * yyyy-MM-dd of today in Kyiv (for the custom range inputs). Deliberately NOT the browser's zone:
 * the backend cuts periods into Europe/Kyiv calendar days, so «today» here must be its «today»
 * (an admin abroad after midnight would otherwise ask for a day the server has not started).
 */
export function todayIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" });
}
