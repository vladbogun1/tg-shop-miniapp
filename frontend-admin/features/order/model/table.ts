/** Таблица заказов: фильтр статуса и порядок сортировки. Без React. */
import type { OrderSortBy, OrderStatus, SortDir } from "@/lib/api";
import { STATUS_LABEL, STATUS_ORDER } from "./status";

export const TABLE_SIZE = 20;

export type StatusFilter = OrderStatus | "ALL";

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Все" },
  ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
];

export interface SortState {
  sortBy: OrderSortBy;
  sortDir: SortDir;
}

/** Повторный клик по активной колонке меняет направление, по другой — переключает её и сортирует по убыванию. */
export function nextSort(cur: SortState, col: OrderSortBy): SortState {
  if (col === cur.sortBy) return { sortBy: col, sortDir: cur.sortDir === "asc" ? "desc" : "asc" };
  return { sortBy: col, sortDir: "desc" };
}
