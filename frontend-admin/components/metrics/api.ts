/**
 * Metrics page API (GET /api/admin/metrics/*) — kept next to the metrics components so the shared
 * lib/api.ts stays untouched. Money is integer minor units (kopecks); buckets are Europe/Kyiv.
 */
import { apiGet, apiPatch } from "@/lib/api";

export type PeriodToken = "today" | "7d" | "month" | "prevmonth" | "90d" | "year" | "custom";
export type Channel = "all" | "miniapp" | "web";

export interface PeriodParams {
  period: PeriodToken;
  from?: string;
  to?: string;
  channel: Channel;
}

export interface PeriodInfo {
  token: string;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  granularity: "HOUR" | "DAY" | "WEEK";
  channel: string;
}

export interface Kpi {
  value: number;
  prev: number | null;
  changePct: number | null;
}

export interface SeriesPoint {
  bucket: string;
  orders: number;
  soldMinor: number;
  receivedMinor: number;
  rejected: number;
}

export interface Overview {
  period: PeriodInfo;
  kpis: { soldMinor: Kpi; receivedMinor: Kpi; orders: Kpi; aovMinor: Kpi; rejectRatePct: Kpi };
  money: { codInTransitMinor: number; codInTransitOrders: number; awaitingPaymentConfirm: number; refundedMinor: number };
  series: SeriesPoint[];
  prevSeries: SeriesPoint[];
  categories: { name: string; units: number; revenueMinor: number; sharePct: number; liveProducts: number; unitsPerProduct: number }[];
  channels: {
    source: string;
    orders: number;
    soldMinor: number;
    aovMinor: number;
    rejectRatePct: number;
    visitors: number | null;
    buyers: number;
    conversionPct: number | null;
  }[];
  heatmap: number[][];
  giveaways: { discountMinor: number; promoOrders: number; giftUnits: number; giftValueMinor: number };
}

export interface ReorderRow {
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  stock: number;
  sold30: number;
  sold90: number;
  velocityPerDay: number;
  daysToZero: number | null;
  recommendQty: number;
  views30: number;
  cartAdds30: number;
  live: boolean;
  urgency: "critical" | "soon" | "plan";
}

export interface DemandRow {
  productId: string;
  title: string;
  stock: number;
  live: boolean;
  views30: number;
  viewers30: number;
  cartAdds30: number;
  sold90: number;
  lastSoldDaysAgo: number | null;
}

export interface Reorder {
  coverDays: number;
  rows: ReorderRow[];
  missedDemand: DemandRow[];
  method: string;
}

export interface DeadStockRow {
  productId: string;
  title: string;
  tags: string[];
  stock: number;
  priceMinor: number;
  valueMinor: number;
  daysWithoutSale: number;
  neverSold: boolean;
  views30: number | null;
  cartAdds30: number | null;
}

export interface Stock {
  period: PeriodInfo;
  kpis: {
    stockValueMinor: number;
    stockUnits: number;
    liveProducts: number;
    daysOfCover: number | null;
    deadStockMinor: number;
    deadStockProducts: number;
    runningOutProducts: number;
    forgottenMinor: number;
    forgottenProducts: number;
  };
  topProducts: { productId: string; title: string; units: number; revenueMinor: number; orders: number; live: boolean; stock: number }[];
  deadStock: DeadStockRow[];
  deadStockBuckets: { days: number; products: number; units: number; valueMinor: number }[];
  forgotten: { productId: string; title: string; stock: number; valueMinor: number; archived: boolean }[];
  categories: { name: string; products: number; units: number; valueMinor: number; daysOfCover: number | null }[];
  reorder: Reorder;
}

export interface MonthForecast {
  month: string;
  actualToDateMinor: number;
  remainingMinor: number;
  totalMinor: number;
  lowMinor: number;
  highMinor: number;
  daysLeft: number;
}

export interface ForecastPoint {
  date: string;
  valueMinor: number;
  lowMinor: number | null;
  highMinor: number | null;
}

export interface Forecast {
  basis: string;
  month: MonthForecast;
  next30: { totalMinor: number; lowMinor: number; highMinor: number };
  history: ForecastPoint[];
  forecast: ForecastPoint[];
  accuracy: {
    mape30: number | null;
    naiveMape30: number | null;
    bias30: number | null;
    coveragePct: number | null;
    backtests: number;
    label: string;
  };
  weekdayFactors: number[];
  method: string;
}

export interface Customers {
  period: PeriodInfo;
  kpis: {
    buyers: Kpi;
    newBuyers: Kpi;
    repeatBuyers: number;
    repeatPct: number | null;
    avgLtvMinor: number;
    allTimeRepeatPct: number | null;
  };
  repeatDistribution: { label: string; buyers: number }[];
  cohorts: { month: string; buyers: number; returnedPct: (number | null)[] }[];
  signups: { weekStart: string; newUsers: number; orderedWithin30: number; conversionPct: number | null; complete: boolean }[];
  topCustomers: { telegramUserId: number | null; name: string | null; username: string | null; orders: number; receivedMinor: number; soldMinor: number }[];
  promoCodes: { code: string; orders: number; discountMinor: number; soldMinor: number; newBuyers: number; rejectRatePct: number }[];
  aovBuckets: { label: string; orders: number; soldMinor: number }[];
  avgItemsPerOrder: number;
}

export interface Funnel {
  period: PeriodInfo;
  dataSince: string | null;
  steps: { key: string; label: string; count: number; fromStartPct: number | null; fromPrevPct: number | null }[];
  lowConversion: {
    productId: string;
    title: string;
    views: number;
    viewers: number;
    cartAdds: number;
    unitsSold: number;
    buyers: number;
    conversionPct: number | null;
    stock: number;
    live: boolean;
  }[];
  note: string | null;
}

export interface CountRow {
  key: string;
  label: string;
  count: number;
}

export interface Violation {
  orderId: string;
  customerName: string | null;
  since: string;
  hours: number;
  totalMinor: number;
}

export interface Operations {
  period: PeriodInfo;
  speed: { key: string; label: string; medianHours: number | null; p90Hours: number | null; count: number; note: string | null }[];
  approvedNotShipped: Violation[];
  shippedNotDelivered: Violation[];
  rejects: {
    rejected: number;
    total: number;
    ratePct: number;
    codes: boolean;
    byReason: CountRow[];
    afterShipping: number;
    paidNotRefunded: number;
    paidNotRefundedMinor: number;
  };
  deliveryMethods: CountRow[];
  paymentOptions: CountRow[];
  clientErrors: { message: string; count: number; users: number }[];
}

export interface Today {
  toApprove: number;
  toShip: number;
  /** Orders paid online that are still NEW (the admin has to confirm them). */
  awaitingPaymentConfirm: number;
  soldTodayMinor: number;
  ordersToday: number;
  soldYesterdayMinor: number;
  soldYesterdaySameTimeMinor: number;
  receivedTodayMinor: number;
  receivedYesterdayMinor: number;
  codInTransitMinor: number;
  runningOut: number;
  reorderTop: ReorderRow[];
  monthForecast: MonthForecast;
}

function qs(p: PeriodParams, extra?: Record<string, string | number>): string {
  const q = new URLSearchParams({ period: p.period, channel: p.channel });
  if (p.period === "custom" && p.from && p.to) {
    q.set("from", p.from);
    q.set("to", p.to);
  }
  if (extra) for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
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
  /** «Скрыть» from the dead-stock table: same endpoint as the products page toggle. */
  hideProduct: (id: string) => apiPatch<unknown>(`/api/admin/products/${id}/active`, { active: false }),
};
