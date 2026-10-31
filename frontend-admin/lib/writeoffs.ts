/**
 * «Списания» — stock that left the shelf without a sale (defect, inventory, mis-sort, sold offline):
 * the reasons, the labels, and GET /api/admin/stock-writeoffs?range=. Lowering a product's stock in
 * the form asks for one of these reasons (ProductModal → StockReasonDialog).
 */
import { apiGet, apiPost } from "@/lib/api";

export type WriteoffReason = "DEFECT" | "INVENTORY" | "MISSORT" | "SOLD_OFFLINE" | "OTHER";

export const WRITEOFF_REASONS: { value: WriteoffReason; label: string }[] = [
  { value: "DEFECT", label: "Брак" },
  { value: "INVENTORY", label: "Инвентаризация/пересчёт" },
  { value: "MISSORT", label: "Пересорт" },
  { value: "SOLD_OFFLINE", label: "Продано вне сайта" },
  { value: "OTHER", label: "Другое" },
];

export const WRITEOFF_LABEL: Record<string, string> = Object.fromEntries(WRITEOFF_REASONS.map((r) => [r.value, r.label]));

export type WriteoffRange = "week" | "month" | "halfyear" | "year" | "all";

export const WRITEOFF_RANGES: { value: WriteoffRange; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "halfyear", label: "Полгода" },
  { value: "year", label: "Год" },
  { value: "all", label: "Всё время" },
];

export interface WriteoffLine {
  id: number;
  createdAt: string;
  productId: string;
  variantId: string | null;
  /** Product name, with « / variant» when a variant was written off. */
  title: string;
  quantity: number;
  reason: string;
  note: string | null;
  orderId: string | null;
  orderShortId: string | null;
  unitValueMinor: number;
  valueMinor: number;
  adminName: string | null;
  /** Of `quantity`: back on the shelf or back in the order (V70); `valueMinor` counts the rest. */
  undoneQty: number;
  undoneNote: string | null;
}

export interface WriteoffReasonTotal {
  reason: string;
  units: number;
  valueMinor: number;
  lines: number;
}

export interface WriteoffReport {
  range: string;
  lines: WriteoffLine[];
  byReason: WriteoffReasonTotal[];
  totalUnits: number;
  totalValueMinor: number;
}

export const writeoffsApi = {
  report: (range: WriteoffRange) => apiGet<WriteoffReport>(`/api/admin/stock-writeoffs?range=${range}`),
};
