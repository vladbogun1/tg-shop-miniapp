import type { Schemas } from "@shop/core/api/schemas";

/**
 * Типы «Поставок» и «Денег закупки». Ответы — из OpenAPI (Schemas): пустые поля и конечные наборы значений
 * описаны в самой схеме (`@Nullable`, `allowableValues` в DTO бэкенда). Тела запросов — вручную.
 */

export type BatchStatus = Schemas["BatchDto"]["status"];
export type EtaMode = Schemas["BatchDto"]["etaMode"];
export type Distribution = Schemas["BatchDto"]["distribution"];
export type BatchFilter = "open" | "arrived" | "cancelled" | "all";
export type SubStatus = Schemas["SubscriberDto"]["status"];
export type Allocation = Schemas["BatchMoneyDto"]["allocation"];
export type ExpenseKind = Schemas["ExpenseDto"]["kind"];
export type LotKind = Schemas["LotDto"]["kind"];

// ---- поставки ---------------------------------------------------------------------
export type Supplier = Schemas["SupplierDto"];
export type SupplierAlias = Schemas["AliasDto"];
export type BatchSummary = Schemas["BatchSummaryDto"];
/** Центы валюты поставки в `unitPriceFx`: null — нет доступа или не внесена. */
export type BatchItem = Schemas["ItemDto"];
export type Batch = Schemas["BatchDto"];

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
export interface ArriveBody {
  dryRun: boolean;
  distribution: Distribution;
  holdHours: number;
  items: ArriveLineReq[];
}
export type ArriveLineResult = Schemas["ArriveLineResult"];
export type ArriveResult = Schemas["ArriveResult"];
export type Subscriber = Schemas["SubscriberDto"];
/** «Чего ждут». `productPeople` — разных людей на любой вариант товара. */
export type Demand = Schemas["DemandDto"];

export type ReleaseResult = Schemas["ReleaseResult"];

// ---- деньги закупки ---------------------------------------------------------------
export type ExpenseFile = Schemas["ExpenseFileDto"];
export type Expense = Schemas["ExpenseDto"];
export type BatchMoneyLine = Schemas["MoneyLineDto"];
export type BatchMoney = Schemas["BatchMoneyDto"];

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

export type BatchSalesLine = Schemas["BatchSalesLineDto"];
export type BatchSales = Schemas["BatchSalesDto"];
export type Lot = Schemas["LotDto"];
export type ProductCost = Schemas["ProductCostDto"];
export type OpeningRow = Schemas["OpeningRowDto"];
export type Reconcile = Schemas["ReconcileDto"];
export type OrderLineCost = Schemas["OrderLineCostDto"];
export type OrderProfit = Schemas["OrderProfitDto"];

export interface OpeningBody {
  productId: string;
  variantId: string | null;
  unitCostMinor: number | null;
}
