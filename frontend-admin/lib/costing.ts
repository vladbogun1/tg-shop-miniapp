/**
 * Деньги закупки («Финансы»): типы и вызовы /api/admin/costing/*. Все суммы — копейки ₴, кроме unitPriceFx
 * (центы валюты закупки). Всё это видят только главный админ и админы с правом «Финансы»:
 * без права блоки не рендерятся (useFinanceAccess), а эндпоинты отвечают 403.
 */
import { useQuery } from "@tanstack/react-query";
import { apiDelete, apiGet, apiOrigin, apiPost, apiPut, getAccessToken, isAuthenticated, uploadFile } from "@/lib/api";

export type Allocation = "BY_VALUE" | "BY_QTY" | "BY_WEIGHT" | "MANUAL";
export type ExpenseKind = "FREIGHT" | "CUSTOMS" | "BROKER" | "DOMESTIC" | "BANK" | "OTHER";

export const ALLOCATIONS: { value: Allocation; label: string; hint: string }[] = [
  { value: "BY_VALUE", label: "По стоимости", hint: "Расходы делятся пропорционально цене закупки." },
  { value: "BY_QTY", label: "По штукам", hint: "Расходы делятся поровну на каждую штуку." },
  { value: "BY_WEIGHT", label: "По весу", hint: "Расходы делятся пропорционально весу (г) каждой штуки." },
  { value: "MANUAL", label: "Вручную", hint: "Доля расходов на позицию вводится руками." },
];
export const EXPENSE_KINDS: { value: ExpenseKind; label: string }[] = [
  { value: "FREIGHT", label: "Доставка" },
  { value: "CUSTOMS", label: "Растаможка" },
  { value: "BROKER", label: "Брокер" },
  { value: "DOMESTIC", label: "Доставка по Украине" },
  { value: "BANK", label: "Банк / комиссия" },
  { value: "OTHER", label: "Другое" },
];
export const expenseKindLabel = (k: string) => EXPENSE_KINDS.find((e) => e.value === k)?.label ?? k;

export interface MoneyLine {
  itemId: number;
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  imageUrl: string | null;
  qtyOrdered: number;
  qtyArrived: number | null;
  qty: number;
  unitPriceFx: number | null;
  weightG: number | null;
  manualExtraMinor: number | null;
  purchaseUnitMinor: number | null;
  purchaseLineMinor: number | null;
  extraLineMinor: number;
  extraUnitMinor: number;
  costUnitMinor: number | null;
  priceMinor: number;
  marginUnitMinor: number | null;
  marginPct: number | null;
}

export interface Expense {
  id: number;
  itemId: number | null;
  kind: ExpenseKind;
  amountMinor: number;
  currency: string;
  fxRate: number | null;
  amountUahMinor: number;
  spentOn: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  files: ExpenseFile[];
}

/** Документ расхода (инвойс, декларация, выписка): фото или PDF в закрытом хранилище. */
export interface ExpenseFile {
  id: number;
  name: string;
  contentType: string | null;
  sizeBytes: number;
  createdAt: string;
}

export interface BatchMoney {
  batchId: number;
  title: string;
  status: string;
  currency: string;
  fxRate: number | null;
  allocation: Allocation;
  costsFinal: boolean;
  preliminary: boolean;
  lines: MoneyLine[];
  expenses: Expense[];
  purchaseMinor: number;
  expensesMinor: number;
  expensesPct: number | null;
  unassignedMinor: number;
  totalMinor: number;
  problems: string[];
}

export interface MoneyRequest {
  currency: string;
  fxRate: number | null;
  allocation: Allocation;
  costsFinal: boolean;
  lines: { itemId: number; unitPriceFx: number | null; weightG: number | null; manualExtraMinor: number | null }[];
}

export interface ExpenseRequest {
  itemId: number | null;
  kind: ExpenseKind;
  amountMinor: number;
  currency: string;
  fxRate: number | null;
  spentOn: string | null;
  note: string | null;
}

export interface BatchSalesLine {
  itemId: number;
  title: string;
  variantName: string | null;
  arrived: number;
  /** В оплаченных заказах. */
  sold: number;
  /** В заказах, которые ещё ждут онлайн-оплаты: ушло с полки, но пока не продажа. */
  reserved: number;
  left: number;
  costUnitMinor: number | null;
  revenueMinor: number;
  costMinor: number;
  profitMinor: number;
}

export interface BatchSales {
  batchId: number;
  spentMinor: number;
  revenueMinor: number;
  costOfSoldMinor: number;
  profitMinor: number;
  marginPct: number | null;
  arrived: number;
  sold: number;
  reserved: number;
  left: number;
  leftValueMinor: number;
  arrivedAt: string | null;
  soldOutAt: string | null;
  daysToSellOut: number | null;
  preliminary: boolean;
  lines: BatchSalesLine[];
}

export type LotKind = "OPENING" | "BATCH" | "MANUAL";
export const LOT_KIND_LABEL: Record<string, string> = { OPENING: "старый остаток", BATCH: "поставка", MANUAL: "ручная правка" };

export interface Lot {
  id: number;
  variantId: string | null;
  variantName: string | null;
  kind: LotKind;
  batchId: number | null;
  batchTitle: string | null;
  qtyIn: number;
  qtyLeft: number;
  unitCostMinor: number | null;
  preliminary: boolean;
  createdAt: string;
}

export interface ProductCost {
  productId: string;
  priceMinor: number;
  currentCostMinor: number | null;
  currentPreliminary: boolean | null;
  marginMinor: number | null;
  marginPct: number | null;
  markupPct: number | null;
  stock: number;
  onLots: number;
  lots: Lot[];
}

export interface OpeningRow {
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  imageUrl: string | null;
  units: number;
  unitCostMinor: number | null;
  priceMinor: number;
}

export interface Reconcile {
  keys: number;
  fixed: number;
  details: string[];
}

export interface OrderLineCost {
  itemId: number;
  title: string;
  variantName: string | null;
  gift: boolean;
  units: number;
  revenueMinor: number;
  costMinor: number;
  unknownUnits: number;
  preliminary: boolean;
}

export interface OrderProfit {
  orderId: string;
  revenueMinor: number;
  costMinor: number;
  feeMinor: number;
  feeEstimated: boolean;
  profitMinor: number;
  marginPct: number | null;
  complete: boolean;
  preliminary: boolean;
  lines: OrderLineCost[];
}

export interface MarginRow {
  key: string;
  label: string;
  units: number;
  revenueMinor: number;
  costMinor: number;
  profitMinor: number;
  marginPct: number | null;
  unknownRevenueMinor: number;
}

export interface MarginReport {
  from: string;
  to: string;
  revenueMinor: number;
  knownRevenueMinor: number;
  knownShare: number | null;
  costMinor: number;
  feeMinor: number;
  giftsCostMinor: number;
  profitMinor: number;
  marginPct: number | null;
  stockValueMinor: number;
  stockUnits: number;
  stockUnknownUnits: number;
  byProduct: MarginRow[];
  byBrand: MarginRow[];
  byCategory: MarginRow[];
  byBatch: MarginRow[];
}

const BASE = "/api/admin/costing";
export const COSTING_KEY = ["costing"] as const;

export const costingApi = {
  access: () => apiGet<{ finance: boolean }>(`${BASE}/access`),
  money: (batchId: number) => apiGet<BatchMoney>(`${BASE}/batches/${batchId}`),
  saveMoney: (batchId: number, body: MoneyRequest) => apiPut<BatchMoney>(`${BASE}/batches/${batchId}`, body),
  addExpense: (batchId: number, body: ExpenseRequest) => apiPost<BatchMoney>(`${BASE}/batches/${batchId}/expenses`, body),
  updateExpense: (id: number, body: ExpenseRequest) => apiPut<BatchMoney>(`${BASE}/expenses/${id}`, body),
  deleteExpense: (id: number) => apiDelete<BatchMoney>(`${BASE}/expenses/${id}`),
  addExpenseFile: (expenseId: number, file: File) =>
    uploadFile(`${BASE}/expenses/${expenseId}/files`, file) as unknown as Promise<BatchMoney>,
  deleteExpenseFile: (fileId: number) => apiDelete<BatchMoney>(`${BASE}/expense-files/${fileId}`),
  sales: (batchId: number) => apiGet<BatchSales>(`${BASE}/batches/${batchId}/sales`),
  nbuRate: (currency: string, date?: string) =>
    apiGet<{ currency: string; date: string; rate: number | null }>(
      `${BASE}/nbu-rate?currency=${encodeURIComponent(currency)}${date ? `&date=${date}` : ""}`
    ),
  product: (productId: string) => apiGet<ProductCost>(`${BASE}/products/${encodeURIComponent(productId)}`),
  opening: () => apiGet<OpeningRow[]>(`${BASE}/opening`),
  setOpening: (body: { productId: string; variantId: string | null; unitCostMinor: number | null }) =>
    apiPut<OpeningRow[]>(`${BASE}/opening`, body),
  reconcile: () => apiPost<Reconcile>(`${BASE}/reconcile`),
  order: (orderId: string) => apiGet<OrderProfit>(`${BASE}/orders/${orderId}`),
  report: (qs: string) => apiGet<MarginReport>(`${BASE}/report?${qs}`),
};

/** May the caller see money. Until the answer arrives (or on error) — no: money blocks stay hidden. */
export function useFinanceAccess(): boolean {
  const q = useQuery({
    queryKey: [...COSTING_KEY, "access"],
    queryFn: costingApi.access,
    enabled: isAuthenticated(),
    staleTime: 300_000,
    retry: false,
  });
  return q.data?.finance === true;
}

/** «95,5» → 9550 копеек; пусто / не число → null. Для сумм ₴ в формах. */
export function inputToMinor(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
/** Копейки → «95.50» для поля ввода; null → пусто. */
export function minorToInput(v: number | null | undefined): string {
  return v == null ? "" : (v / 100).toFixed(2);
}

/**
 * Открыть документ расхода в новой вкладке. Файл отдаётся только с токеном (права «Финансы»), поэтому
 * не ссылкой, а через blob; вкладку открываем сразу по клику, иначе её заблокирует браузер.
 */
export async function openExpenseFile(file: ExpenseFile): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const res = await fetch(`${apiOrigin}${BASE}/expense-files/${file.id}`, {
      headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
      credentials: "include",
    });
    if (!res.ok) throw new Error(res.status === 403 ? "Нет права «Финансы»" : "Документ не открылся");
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}
