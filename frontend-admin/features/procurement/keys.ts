import type { BatchFilter } from "./model/types";

const PREORDERS = ["preorders"] as const;
const COSTING = ["costing"] as const;

/**
 * Ключи кэша «Поставок» (`preorders`) и «Денег закупки» (`costing`). Корни общие: запись в любом месте
 * сбрасывает всё под ними, в том числе «Чего ждут» в списке товаров и маржу в метриках.
 */
export const procurementKeys = {
  preordersRoot: () => PREORDERS,
  batches: (filter: BatchFilter) => [...PREORDERS, "batches", filter] as const,
  batch: (id: number | string) => [...PREORDERS, "batch", id] as const,
  batchSubs: (id: number) => [...PREORDERS, "batch-subs", id] as const,
  productSubs: (productId: string) => [...PREORDERS, "product-subs", productId] as const,
  suppliers: () => [...PREORDERS, "suppliers"] as const,
  demand: () => [...PREORDERS, "demand"] as const,

  costingRoot: () => COSTING,
  access: () => [...COSTING, "access"] as const,
  batchCosting: (id: number) => [...COSTING, "batch", id] as const,
  money: (batchId: number) => [...COSTING, "money", batchId] as const,
  sales: (batchId: number) => [...COSTING, "sales", batchId] as const,
  product: (productId: string) => [...COSTING, "product", productId] as const,
  order: (orderId: string) => [...COSTING, "order", orderId] as const,
  opening: () => [...COSTING, "opening"] as const,
  /** Корень отчёта по марже (его держит `analyticsKeys.margin`). */
  report: () => [...COSTING, "report"] as const,
};
