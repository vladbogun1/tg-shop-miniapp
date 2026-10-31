/**
 * API метрик: /api/admin/metrics/*, метрики предзаказов, отчёт по марже и «Скрыть» из таблицы
 * «Не продаётся». Деньги — копейки; границы периодов — календарные дни Киева (считает бэкенд).
 */
import { apiGet, apiPatch } from "@/lib/api";
import type {
  Channel,
  Customers,
  Forecast,
  Funnel,
  MarginReport,
  Operations,
  Overview,
  PeriodParams,
  PreorderMetrics,
  Returns,
  Stock,
  Today,
} from "./model/types";

function qs(p: PeriodParams, extra?: Record<string, string | number>): string {
  const q = new URLSearchParams({ period: p.period, channel: p.channel });
  if (p.period === "custom" && p.from && p.to) {
    q.set("from", p.from);
    q.set("to", p.to);
  }
  if (extra) for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
  return q.toString();
}

/** У отчёта по марже нет канала. */
function marginQs(p: PeriodParams): string {
  const q = new URLSearchParams({ period: p.period });
  if (p.period === "custom" && p.from && p.to) {
    q.set("from", p.from);
    q.set("to", p.to);
  }
  return q.toString();
}

export const metricsApi = {
  overview: (p: PeriodParams) => apiGet<Overview>(`/api/admin/metrics/overview?${qs(p)}`),
  stock: (p: PeriodParams, deadDays: number, coverDays: number) =>
    apiGet<Stock>(`/api/admin/metrics/stock?${qs(p, { deadDays, coverDays })}`),
  customers: (p: PeriodParams) => apiGet<Customers>(`/api/admin/metrics/customers?${qs(p)}`),
  funnel: (p: PeriodParams) => apiGet<Funnel>(`/api/admin/metrics/funnel?${qs(p)}`),
  operations: (p: PeriodParams) => apiGet<Operations>(`/api/admin/metrics/operations?${qs(p)}`),
  forecast: (channel: Channel) => apiGet<Forecast>(`/api/admin/metrics/forecast?channel=${channel}`),
  today: () => apiGet<Today>("/api/admin/metrics/today"),
  returns: (p: PeriodParams) => apiGet<Returns>(`/api/admin/metrics/returns?${qs(p)}`),
  preorders: (from: string, to: string) =>
    apiGet<PreorderMetrics>(`/api/admin/preorders/metrics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  margin: (p: PeriodParams) => apiGet<MarginReport>(`/api/admin/costing/report?${marginQs(p)}`),
  /** «Скрыть» from the dead-stock table: same endpoint as the products page toggle. */
  hideProduct: (id: string) => apiPatch<unknown>(`/api/admin/products/${id}/active`, { active: false }),
};
