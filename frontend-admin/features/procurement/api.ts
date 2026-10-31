/**
 * API «Поставок» (/api/admin/preorders/*) и «Денег закупки» (/api/admin/costing/*). Закупочная цена и курс
 * приходят только главному админу и админам с правом «Финансы»; без права эндпоинты отвечают 403.
 */
import { apiDelete, apiGet, apiPost, apiPut, uploadFile } from "@/lib/http";
import { apiOrigin } from "@/lib/origin";
import { getAccessToken } from "@/lib/session";
import type {
  ArriveBody,
  ArriveResult,
  Batch,
  BatchFilter,
  BatchMoney,
  BatchRequest,
  BatchSales,
  BatchSummary,
  Demand,
  ExpenseRequest,
  MoneyRequest,
  OpeningBody,
  OpeningRow,
  OrderProfit,
  ProductCost,
  Reconcile,
  ReleaseResult,
  Subscriber,
  Supplier,
} from "./model/types";

const PRE = "/api/admin/preorders";
const COST = "/api/admin/costing";

export const preordersApi = {
  batches: (filter: BatchFilter) => apiGet<BatchSummary[]>(`${PRE}/batches?filter=${filter}`),
  batch: (id: number | string) => apiGet<Batch>(`${PRE}/batches/${id}`),
  create: (body: BatchRequest) => apiPost<Batch>(`${PRE}/batches`, body),
  update: (id: number, body: BatchRequest) => apiPut<Batch>(`${PRE}/batches/${id}`, body),
  setStatus: (id: number, status: "ORDERED" | "IN_TRANSIT" | "CUSTOMS") => apiPost<Batch>(`${PRE}/batches/${id}/status`, { status }),
  arrive: (id: number, body: ArriveBody) => apiPost<ArriveResult>(`${PRE}/batches/${id}/arrive`, body),
  cancel: (id: number, closeQueue: boolean) => apiPost<Batch>(`${PRE}/batches/${id}/cancel`, { closeQueue }),
  subscribers: (id: number | string) => apiGet<Subscriber[]>(`${PRE}/batches/${id}/subscribers`),
  productSubscribers: (productId: string) => apiGet<Subscriber[]>(`${PRE}/subscribers?productId=${encodeURIComponent(productId)}`),
  removeSubscriber: (id: number) => apiDelete<void>(`${PRE}/subscriptions/${id}`),
  demand: () => apiGet<Demand[]>(`${PRE}/demand`),
  /** Раздать брони после ручного пополнения остатка (не через поставку). */
  release: (productId: string, variantId: string | null) => apiPost<ReleaseResult>(`${PRE}/demand/release`, { productId, variantId }),
  suppliers: () => apiGet<Supplier[]>(`${PRE}/suppliers`),
  createSupplier: (body: { name: string; note: string | null }) => apiPost<Supplier>(`${PRE}/suppliers`, body),
};

export const costingApi = {
  access: () => apiGet<{ finance: boolean }>(`${COST}/access`),
  money: (batchId: number) => apiGet<BatchMoney>(`${COST}/batches/${batchId}`),
  saveMoney: (batchId: number, body: MoneyRequest) => apiPut<BatchMoney>(`${COST}/batches/${batchId}`, body),
  addExpense: (batchId: number, body: ExpenseRequest) => apiPost<BatchMoney>(`${COST}/batches/${batchId}/expenses`, body),
  updateExpense: (id: number, body: ExpenseRequest) => apiPut<BatchMoney>(`${COST}/expenses/${id}`, body),
  deleteExpense: (id: number) => apiDelete<BatchMoney>(`${COST}/expenses/${id}`),
  addExpenseFile: (expenseId: number, file: File) =>
    uploadFile(`${COST}/expenses/${expenseId}/files`, file) as unknown as Promise<BatchMoney>,
  deleteExpenseFile: (fileId: number) => apiDelete<BatchMoney>(`${COST}/expense-files/${fileId}`),
  sales: (batchId: number) => apiGet<BatchSales>(`${COST}/batches/${batchId}/sales`),
  nbuRate: (currency: string, date?: string) =>
    apiGet<{ currency: string; date: string; rate: number | null }>(
      `${COST}/nbu-rate?currency=${encodeURIComponent(currency)}${date ? `&date=${date}` : ""}`,
    ),
  product: (productId: string) => apiGet<ProductCost>(`${COST}/products/${encodeURIComponent(productId)}`),
  opening: () => apiGet<OpeningRow[]>(`${COST}/opening`),
  setOpening: (body: OpeningBody) => apiPut<OpeningRow[]>(`${COST}/opening`, body),
  reconcile: () => apiPost<Reconcile>(`${COST}/reconcile`),
  order: (orderId: string) => apiGet<OrderProfit>(`${COST}/orders/${orderId}`),
};

/** Скачать файл с токеном (ссылкой нельзя: нужен заголовок Authorization). */
export function fetchWithToken(path: string): Promise<Response> {
  return fetch(`${apiOrigin}${path}`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` }, credentials: "include" });
}

export const PREORDERS_PATH = PRE;
export const COSTING_PATH = COST;
