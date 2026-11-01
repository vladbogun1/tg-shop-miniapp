import type { Schemas } from "@shop/core/api/schemas";

export type WriteoffReason = "DEFECT" | "INVENTORY" | "MISSORT" | "SOLD_OFFLINE" | "OTHER";

export type WriteoffRange = "week" | "month" | "halfyear" | "year" | "all";

/** Строка списания: пустые поля — null в схеме бэкенда. */
export type WriteoffLine = Schemas["InventoryStockWriteoffReportServiceLine"];

export type WriteoffReasonTotal = Schemas["ReasonTotal"];

export type WriteoffReport = Schemas["Report"];

/** Окно «Вернуть на склад» передаёт страница: оно живёт в features/returns, а та зовёт товары, а товары — эту фичу (цикл). */
export type RestoreModal = import("react").ComponentType<{
  /** null = закрыто. `left` — сколько штук ещё числится списанными. */
  writeoff: { id: number; title: string; left: number } | null;
  onClose: () => void;
  onDone: () => void;
}>;
