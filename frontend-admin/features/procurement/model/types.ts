import type { Schemas } from "@shop/core/api/schemas";

/**
 * Типы «Поставок» и «Денег закупки». Ответы — из OpenAPI (Schemas): генерация считает все поля обязательными,
 * строки — `string`, а бэкенд шлёт `null` и конечные наборы значений, поэтому здесь они уточнены (Omit + &).
 * Тела запросов — вручную.
 */

export type BatchStatus = "ORDERED" | "IN_TRANSIT" | "CUSTOMS" | "ARRIVED" | "CANCELLED";
export type EtaMode = "DATE" | "RANGE" | "APPROX" | "HIDDEN";
export type Distribution = "QUEUE_HOLD" | "ALL_AT_ONCE";
export type BatchFilter = "open" | "arrived" | "cancelled" | "all";
export type SubStatus = "WAITING" | "HELD" | "NOTIFIED" | "BOUGHT" | "EXPIRED" | "CANCELLED";
export type Allocation = "BY_VALUE" | "BY_QTY" | "BY_WEIGHT" | "MANUAL";
export type ExpenseKind = "FREIGHT" | "CUSTOMS" | "BROKER" | "DOMESTIC" | "BANK" | "OTHER";
export type LotKind = "OPENING" | "BATCH" | "MANUAL";

type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

// ---- поставки ---------------------------------------------------------------------
export type Supplier = Nullable<Schemas["SupplierDto"], "note">;

export type BatchSummary = Omit<Schemas["BatchSummaryDto"], "status" | "etaMode" | "supplierName" | "etaFrom" | "etaTo" | "arrivedAt"> & {
  status: BatchStatus;
  etaMode: EtaMode;
  supplierName: string | null;
  etaFrom: string | null;
  etaTo: string | null;
  arrivedAt: string | null;
};

/** Центы валюты поставки в `unitPriceFx`: null — нет доступа или не внесена. */
export type BatchItem = Omit<Schemas["ItemDto"], "variantId" | "variantName" | "imageUrl" | "qtyArrived" | "unitPriceFx"> & {
  variantId: string | null;
  variantName: string | null;
  imageUrl: string | null;
  qtyArrived: number | null;
  unitPriceFx: number | null;
};

type BatchNullable = "supplierId" | "supplierName" | "privateNote" | "publicNote" | "etaFrom" | "etaTo" | "currency" | "fxRate" | "createdBy" | "inTransitAt" | "arrivedAt" | "cancelledAt";
export type Batch = Omit<Schemas["BatchDto"], BatchNullable | "status" | "etaMode" | "distribution" | "items" | "eta"> & {
  status: BatchStatus;
  etaMode: EtaMode;
  distribution: Distribution;
  items: BatchItem[];
} & { [K in BatchNullable]: Schemas["BatchDto"][K] | null };

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
export type ArriveLineResult = Nullable<Schemas["ArriveLineResult"], "variantName">;
export type ArriveResult = Omit<Schemas["ArriveResult"], "distribution" | "lines"> & { distribution: Distribution; lines: ArriveLineResult[] };

type SubscriberNullable = "name" | "username" | "variantId" | "variantName" | "position" | "holdUntil" | "source" | "closedAt" | "closeReason";
export type Subscriber = Omit<Schemas["SubscriberDto"], SubscriberNullable | "status"> & {
  status: SubStatus;
} & { [K in SubscriberNullable]: Schemas["SubscriberDto"][K] | null };

/** «Чего ждут». `productPeople` — разных людей на любой вариант товара; нет у старого бэкенда. */
export type Demand = Omit<Schemas["DemandDto"], "variantId" | "variantName" | "imageUrl" | "productPeople" | "openBatchId" | "openBatchTitle"> & {
  variantId: string | null;
  variantName: string | null;
  imageUrl: string | null;
  productPeople?: number;
  openBatchId: number | null;
  openBatchTitle: string | null;
};

export type ReleaseResult = Schemas["ReleaseResult"];

// ---- деньги закупки ---------------------------------------------------------------
export type ExpenseFile = Nullable<Schemas["ExpenseFileDto"], "contentType">;

type ExpenseNullable = "itemId" | "fxRate" | "spentOn" | "note" | "createdBy";
export type Expense = Omit<Schemas["ExpenseDto"], ExpenseNullable | "kind" | "files"> & {
  kind: ExpenseKind;
  files: ExpenseFile[];
} & { [K in ExpenseNullable]: Schemas["ExpenseDto"][K] | null };

type MoneyLineNullable =
  | "variantId" | "variantName" | "imageUrl" | "qtyArrived" | "unitPriceFx" | "weightG" | "manualExtraMinor"
  | "purchaseUnitMinor" | "purchaseLineMinor" | "costUnitMinor" | "marginUnitMinor" | "marginPct";
export type MoneyLine = { [K in MoneyLineNullable]: Schemas["MoneyLineDto"][K] | null } & Omit<Schemas["MoneyLineDto"], MoneyLineNullable>;

export type BatchMoney = Omit<Schemas["BatchMoneyDto"], "fxRate" | "expensesPct" | "allocation" | "lines" | "expenses"> & {
  fxRate: number | null;
  expensesPct: number | null;
  allocation: Allocation;
  lines: MoneyLine[];
  expenses: Expense[];
};

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

type SalesLineNullable = "variantName" | "costUnitMinor";
export type BatchSalesLine = Omit<Schemas["BatchSalesLineDto"], SalesLineNullable> & { [K in SalesLineNullable]: Schemas["BatchSalesLineDto"][K] | null };

type SalesNullable = "marginPct" | "arrivedAt" | "soldOutAt" | "daysToSellOut";
export type BatchSales = Omit<Schemas["BatchSalesDto"], SalesNullable | "lines"> & {
  lines: BatchSalesLine[];
} & { [K in SalesNullable]: Schemas["BatchSalesDto"][K] | null };

export type Lot = Omit<Schemas["LotDto"], "variantId" | "variantName" | "batchId" | "batchTitle" | "unitCostMinor" | "kind"> & {
  kind: LotKind;
  variantId: string | null;
  variantName: string | null;
  batchId: number | null;
  batchTitle: string | null;
  unitCostMinor: number | null;
};

type ProductCostNullable = "currentCostMinor" | "currentPreliminary" | "marginMinor" | "marginPct" | "markupPct";
export type ProductCost = Omit<Schemas["ProductCostDto"], ProductCostNullable | "lots"> & {
  lots: Lot[];
} & { [K in ProductCostNullable]: Schemas["ProductCostDto"][K] | null };

type OpeningNullable = "variantId" | "variantName" | "imageUrl" | "unitCostMinor";
export type OpeningRow = Omit<Schemas["OpeningRowDto"], OpeningNullable> & { [K in OpeningNullable]: Schemas["OpeningRowDto"][K] | null };

export type Reconcile = Schemas["ReconcileDto"];
export type OrderLineCost = Nullable<Schemas["OrderLineCostDto"], "variantName">;
export type OrderProfit = Omit<Schemas["OrderProfitDto"], "marginPct" | "lines"> & { marginPct: number | null; lines: OrderLineCost[] };

export interface OpeningBody {
  productId: string;
  variantId: string | null;
  unitCostMinor: number | null;
}
