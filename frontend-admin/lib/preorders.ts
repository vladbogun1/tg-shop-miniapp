/**
 * «Поставки» (предзаказы): типы, подписи и вызовы /api/admin/preorders/*.
 * Закупочная цена и курс приходят только главному админу (`moneyVisible`); цена закупки — в центах валюты.
 */
import { useQuery } from "@tanstack/react-query";
import { apiDelete, apiGet, apiOrigin, apiPost, apiPut, getAccessToken, isAuthenticated } from "@/lib/api";

export type BatchStatus = "ORDERED" | "IN_TRANSIT" | "CUSTOMS" | "ARRIVED" | "CANCELLED";
export type EtaMode = "DATE" | "RANGE" | "APPROX" | "HIDDEN";
export type Distribution = "QUEUE_HOLD" | "ALL_AT_ONCE";
export type BatchFilter = "open" | "arrived" | "cancelled" | "all";

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  ORDERED: "Заказана",
  IN_TRANSIT: "В пути",
  CUSTOMS: "На таможне",
  ARRIVED: "Приехала",
  CANCELLED: "Отменена",
};
export const BATCH_STATUS_TONE: Record<BatchStatus, "neutral" | "accent" | "ok" | "warn" | "danger" | "info"> = {
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

export interface Supplier {
  id: number;
  name: string;
  note: string | null;
}

export interface BatchSummary {
  id: number;
  title: string;
  supplierName: string | null;
  status: BatchStatus;
  etaMode: EtaMode;
  etaFrom: string | null;
  etaTo: string | null;
  preorderOpen: boolean;
  itemsCount: number;
  qtyOrdered: number;
  waitingPeople: number;
  waitingQty: number;
  createdAt: string;
  arrivedAt: string | null;
}

export interface BatchItem {
  id: number;
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  imageUrl: string | null;
  stock: number;
  priceMinor: number;
  qtyOrdered: number;
  qtyArrived: number | null;
  /** Центы валюты поставки; null — нет доступа или не внесена. */
  unitPriceFx: number | null;
  waitingPeople: number;
  waitingQty: number;
}

export interface Batch {
  id: number;
  title: string;
  supplierId: number | null;
  supplierName: string | null;
  privateNote: string | null;
  publicNote: string | null;
  status: BatchStatus;
  etaMode: EtaMode;
  etaFrom: string | null;
  etaTo: string | null;
  holdHours: number;
  distribution: Distribution;
  preorderOpen: boolean;
  currency: string | null;
  fxRate: number | null;
  moneyVisible: boolean;
  items: BatchItem[];
  createdBy: string | null;
  createdAt: string;
  inTransitAt: string | null;
  arrivedAt: string | null;
  cancelledAt: string | null;
}

export interface ItemRequest {
  id: number | null;
  productId: string;
  variantId: string | null;
  qtyOrdered: number;
  unitPriceFx: number | null;
}

export interface BatchRequest {
  title: string;
  supplierId: number | null;
  privateNote: string | null;
  publicNote: string | null;
  etaMode: EtaMode;
  etaFrom: string | null;
  etaTo: string | null;
  holdHours: number;
  distribution: Distribution;
  preorderOpen: boolean;
  currency?: string;
  fxRate?: number | null;
  /** undefined — не трогать позиции (поставка уже приехала). */
  items?: ItemRequest[];
}

export interface ArriveLineReq {
  itemId: number;
  qtyArrived: number;
  /** Новая цена продажи, копейки; null — оставить. */
  priceMinor: number | null;
}
export interface ArriveLineResult {
  itemId: number;
  title: string;
  variantName: string | null;
  arrived: number;
  stockAfter: number;
  heldPeople: number;
  heldQty: number;
  notifiedPeople: number;
  shortPeople: number;
  freeAfter: number;
  priceMinor: number;
}
export interface ArriveResult {
  dryRun: boolean;
  distribution: Distribution;
  holdHours: number;
  lines: ArriveLineResult[];
}

export type SubStatus = "WAITING" | "HELD" | "NOTIFIED" | "BOUGHT" | "EXPIRED" | "CANCELLED";
export interface Subscriber {
  id: number;
  userId: number;
  name: string | null;
  username: string | null;
  botBlocked: boolean;
  productId: string;
  variantId: string | null;
  productTitle: string;
  variantName: string | null;
  qty: number;
  status: SubStatus;
  position: number | null;
  heldQty: number;
  holdUntil: string | null;
  source: string | null;
  createdAt: string;
  closedAt: string | null;
  closeReason: string | null;
}

export interface Demand {
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  imageUrl: string | null;
  stock: number;
  priceMinor: number;
  people: number;
  /** Разных людей, ждущих любой вариант товара (без вариантов = people). Нет у старого бэкенда. */
  productPeople?: number;
  units: number;
  firstAt: string;
  newLast7d: number;
  openBatchId: number | null;
  openBatchTitle: string | null;
}

export interface ReleaseResult {
  heldPeople: number;
  heldQty: number;
  shortPeople: number;
  freeAfter: number;
}

/** Метрики предзаказов за период (`GET /metrics?from&to`). */
export interface PreorderMetrics {
  subscriptions: number;
  people: number;
  holdsGiven: number;
  boughtFromHold: number;
  expired: number;
  conversionPercent: number;
  arrivedUnits: number;
}

const BASE = "/api/admin/preorders";

export const preordersApi = {
  batches: (filter: BatchFilter) => apiGet<BatchSummary[]>(`${BASE}/batches?filter=${filter}`),
  batch: (id: number | string) => apiGet<Batch>(`${BASE}/batches/${id}`),
  create: (body: BatchRequest) => apiPost<Batch>(`${BASE}/batches`, body),
  update: (id: number, body: BatchRequest) => apiPut<Batch>(`${BASE}/batches/${id}`, body),
  setStatus: (id: number, status: "ORDERED" | "IN_TRANSIT" | "CUSTOMS") => apiPost<Batch>(`${BASE}/batches/${id}/status`, { status }),
  arrive: (
    id: number,
    body: { dryRun: boolean; distribution: Distribution; holdHours: number; items: ArriveLineReq[] }
  ) => apiPost<ArriveResult>(`${BASE}/batches/${id}/arrive`, body),
  cancel: (id: number, closeQueue: boolean) => apiPost<Batch>(`${BASE}/batches/${id}/cancel`, { closeQueue }),
  subscribers: (id: number | string) => apiGet<Subscriber[]>(`${BASE}/batches/${id}/subscribers`),
  productSubscribers: (productId: string) => apiGet<Subscriber[]>(`${BASE}/subscribers?productId=${encodeURIComponent(productId)}`),
  removeSubscriber: (id: number) => apiDelete<void>(`${BASE}/subscriptions/${id}`),
  demand: () => apiGet<Demand[]>(`${BASE}/demand`),
  /** Раздать брони после ручного пополнения остатка (не через поставку). */
  release: (productId: string, variantId: string | null) => apiPost<ReleaseResult>(`${BASE}/demand/release`, { productId, variantId }),
  metrics: (from: string, to: string) =>
    apiGet<PreorderMetrics>(`${BASE}/metrics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  suppliers: () => apiGet<Supplier[]>(`${BASE}/suppliers`),
  createSupplier: (body: { name: string; note: string | null }) => apiPost<Supplier>(`${BASE}/suppliers`, body),
};

export const PREORDERS_KEY = ["preorders"] as const;

/** «Чего ждут» — один запрос на экран «Поставки», список товаров и карточку товара. */
export function useDemand(enabled = true) {
  return useQuery({
    queryKey: [...PREORDERS_KEY, "demand"],
    queryFn: preordersApi.demand,
    enabled: enabled && isAuthenticated(),
    staleTime: 60_000,
    retry: false,
  });
}

/** Строки «Чего ждут» по товару (все варианты). */
export function demandRowsOfProduct(demand: Demand[] | undefined, productId: string): Demand[] {
  return (demand ?? []).filter((d) => d.productId === productId);
}

/** Сколько разных людей ждут эти строки: `productPeople` (без двойного счёта по вариантам) или сумма. */
export function peopleOfRows(rows: Demand[]): number {
  let sum = 0;
  let distinct: number | null = null;
  for (const d of rows) {
    sum += d.people;
    if (d.productPeople != null) distinct = Math.max(distinct ?? 0, d.productPeople);
  }
  return distinct ?? sum;
}

/** Ждущие по товару (все варианты): людей и штук. */
export function demandOfProduct(demand: Demand[] | undefined, productId: string): { people: number; units: number } | null {
  if (!demand) return null;
  const rows = demandRowsOfProduct(demand, productId);
  const units = rows.reduce((n, d) => n + d.units, 0);
  const people = peopleOfRows(rows);
  return people > 0 ? { people, units } : null;
}

/** Раздать брони по строкам «Чего ждут» (одна строка — один запрос). Результаты суммируются. */
export async function releaseDemand(rows: Pick<Demand, "productId" | "variantId">[]): Promise<ReleaseResult> {
  const sum: ReleaseResult = { heldPeople: 0, heldQty: 0, shortPeople: 0, freeAfter: 0 };
  for (const r of rows) {
    const res = await preordersApi.release(r.productId, r.variantId ?? null);
    sum.heldPeople += res.heldPeople;
    sum.heldQty += res.heldQty;
    sum.shortPeople += res.shortPeople;
    sum.freeAfter += res.freeAfter;
  }
  return sum;
}

/** Сообщение о результате раздачи броней. */
export function releaseSummary(r: ReleaseResult): string {
  if (r.heldPeople === 0) return "Бронь никому не ушла: свободных штук нет";
  return `Бронь получили ${r.heldPeople} чел (${r.heldQty} шт)${r.shortPeople > 0 ? `, не хватило ${r.shortPeople} чел` : ""}`;
}

/**
 * Скачать CSV ждущих (по поставке или по товару/варианту). Файл отдаётся только с токеном,
 * поэтому через fetch + blob, а не ссылкой.
 */
export async function downloadSubscribersCsv(scope: { batchId: number } | { productId?: string; variantId?: string | null }): Promise<void> {
  let path: string;
  let fallback: string;
  if ("batchId" in scope) {
    path = `${BASE}/batches/${scope.batchId}/subscribers.csv`;
    fallback = `ozhidayut-postavka-${scope.batchId}.csv`;
  } else {
    const q = new URLSearchParams();
    if (scope.productId) q.set("productId", scope.productId);
    if (scope.variantId) q.set("variantId", scope.variantId);
    const qs = q.toString();
    path = `${BASE}/subscribers.csv${qs ? `?${qs}` : ""}`;
    fallback = "ozhidayut.csv";
  }
  const res = await fetch(`${apiOrigin}${path}`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` }, credentials: "include" });
  if (!res.ok) throw new Error(res.status === 404 ? "Выгрузка пока недоступна на сервере" : res.status === 403 ? "Недостаточно прав" : "Не удалось скачать CSV");
  const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name ? decodeURIComponent(name) : fallback;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---- helpers ---------------------------------------------------------------------

export function lineTitle(title: string, variantName: string | null | undefined): string {
  return variantName ? `${title} · ${variantName}` : title;
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
/** «2026-11-20» → «20 ноября» (год — только если не текущий). */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const cur = new Date().getFullYear();
  return `${d} ${MONTHS[m - 1]}${y !== cur ? ` ${y}` : ""}`;
}

/** Whole weeks from today to a target date, rounded up; 0 once it has come. */
export function weeksUntil(target: string | null | undefined): number {
  if (!target) return 0;
  const t = new Date(`${target}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((t.getTime() - today.getTime()) / 86_400_000);
  return days <= 0 ? 0 : Math.ceil(days / 7);
}

/** Local «YYYY-MM-DD» for today + N days. */
export function isoInDays(days: number): string {
  const d = new Date();
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

export const SUB_STATUS_LABEL: Record<SubStatus, string> = {
  WAITING: "Ждёт",
  HELD: "Бронь",
  NOTIFIED: "Уведомлён",
  BOUGHT: "Купил",
  EXPIRED: "Бронь сгорела",
  CANCELLED: "Вышел",
};
export const SUB_STATUS_TONE: Record<SubStatus, "neutral" | "accent" | "ok" | "warn" | "danger" | "info"> = {
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
