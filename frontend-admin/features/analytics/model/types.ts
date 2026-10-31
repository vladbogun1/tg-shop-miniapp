import type { Schemas } from "@shop/core/api/schemas";

/** Токен периода метрик (бэкенд режет периоды по календарным дням Киева). */
export type PeriodToken = "today" | "7d" | "month" | "prevmonth" | "90d" | "year" | "custom";
export type Channel = "all" | "miniapp" | "web";

export interface PeriodParams {
  period: PeriodToken;
  from?: string;
  to?: string;
  channel: Channel;
}

// Ответы API — из OpenAPI (docs/ARCHITECTURE-FRONT.md, 2.6); имена прежние, чтобы вкладки читались как раньше.
export type PeriodInfo = Schemas["PeriodInfo"];
export type Kpi = Schemas["Kpi"];
export type SeriesPoint = Schemas["SeriesPoint"];
export type Overview = Schemas["AnalyticsOverview"];
export type SchemeRow = Schemas["SchemeRow"];
export type OnlinePayments = Schemas["OnlinePayments"];
export type ReorderRow = Schemas["ReorderRow"];
export type DemandRow = Schemas["DemandRow"];
export type Reorder = Schemas["Reorder"];
export type DeadStockRow = Schemas["DeadStockRow"];
export type Stock = Schemas["Stock"];
export type MonthForecast = Schemas["MonthForecast"];
export type ForecastPoint = Schemas["ForecastPoint"];
export type Forecast = Schemas["Forecast"];
export type Customers = Schemas["Customers"];
export type Funnel = Schemas["Funnel"];
export type CountRow = Schemas["CountRow"];
export type Violation = Schemas["AnalyticsViolation"];
export type Operations = Schemas["Operations"];
export type Today = Schemas["Today"];
export type Returns = Schemas["Returns"];
export type PreorderMetrics = Schemas["MetricsDto"];
export type MarginReport = Schemas["MarginReportDto"];
export type MarginRow = Schemas["MarginRowDto"];
