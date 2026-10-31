/**
 * The orders board / table period, remembered per browser. Short rolling windows («7 дней»,
 * «30 дней») plus calendar ones like on the metrics page («Этот месяц», «Прошлый месяц», «Этот год»,
 * «Свой»). Its own key: «Покупатели» keeps the plain TimeRange in `tgshop_admin_range`.
 */
export type OrdersRange = "week" | "month" | "thismonth" | "prevmonth" | "thisyear" | "all" | "custom";

export interface OrdersPeriod {
  range: OrdersRange;
  /** yyyy-MM-dd, only for `custom`. */
  from?: string;
  to?: string;
}

export const ORDERS_PERIOD_OPTIONS: { value: OrdersRange; label: string }[] = [
  { value: "week", label: "7 дней" },
  { value: "month", label: "30 дней" },
  { value: "thismonth", label: "Этот месяц" },
  { value: "prevmonth", label: "Прошлый месяц" },
  { value: "thisyear", label: "Этот год" },
  { value: "all", label: "Всё" },
  { value: "custom", label: "Свой" },
];

export const PERIOD_STORAGE_KEY = "tgshop_admin_orders_period";
export const DEFAULT_PERIOD: OrdersPeriod = { range: "month" };

export function isValidPeriod(v: unknown): v is OrdersPeriod {
  if (!v || typeof v !== "object") return false;
  const p = v as OrdersPeriod;
  return ORDERS_PERIOD_OPTIONS.some((o) => o.value === p.range) && (p.range !== "custom" || (!!p.from && !!p.to));
}

/** Query-string pairs for the board / list endpoints. */
export function periodQuery(p: OrdersPeriod): Record<string, string> {
  return p.range === "custom" && p.from && p.to ? { range: p.range, from: p.from, to: p.to } : { range: p.range };
}
