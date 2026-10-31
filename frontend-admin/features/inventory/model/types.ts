import type { Schemas } from "@shop/core/api/schemas";

export type WriteoffReason = "DEFECT" | "INVENTORY" | "MISSORT" | "SOLD_OFFLINE" | "OTHER";

export type WriteoffRange = "week" | "month" | "halfyear" | "year" | "all";

type NullableTextField = "variantId" | "note" | "orderId" | "orderShortId" | "adminName" | "undoneNote";

/** Сгенерированная схема считает все поля обязательными, а сервер присылает null — уточняем. */
export type WriteoffLine = Omit<Schemas["InventoryStockWriteoffReportServiceLine"], NullableTextField> & {
  [K in NullableTextField]: string | null;
};

export type WriteoffReasonTotal = Schemas["ReasonTotal"];

export type WriteoffReport = Omit<Schemas["Report"], "lines"> & { lines: WriteoffLine[] };

/** Окно «Вернуть на склад» передаёт страница: оно живёт в features/returns, а та зовёт товары, а товары — эту фичу (цикл). */
export type RestoreModal = import("react").ComponentType<{
  /** null = закрыто. `left` — сколько штук ещё числится списанными. */
  writeoff: { id: number; title: string; left: number } | null;
  onClose: () => void;
  onDone: () => void;
}>;
