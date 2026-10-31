import type { SortDir } from "@/lib/sort";
import type { UserSortBy } from "./types";

export const USERS_PAGE_SIZE = 30;

/** Phones have no sortable table headers — sort from a select. */
export const MOBILE_SORTS: { value: string; label: string }[] = [
  { value: "createdAt:desc", label: "Новые сначала" },
  { value: "createdAt:asc", label: "Старые сначала" },
  { value: "lastSeenAt:desc", label: "Недавно заходили" },
  { value: "ordersCount:desc", label: "Больше заказов" },
  { value: "totalSpentMinor:desc", label: "Больше потратили" },
  { value: "username:asc", label: "Username А–Я" },
];

export interface Sorting {
  sortBy: UserSortBy;
  sortDir: SortDir;
}

/** Клик по заголовку: тот же столбец — меняем направление, другой — по убыванию. */
export function toggleSorting(cur: Sorting, col: UserSortBy): Sorting {
  if (col === cur.sortBy) return { sortBy: cur.sortBy, sortDir: cur.sortDir === "asc" ? "desc" : "asc" };
  return { sortBy: col, sortDir: "desc" };
}

/** Значение select'а «createdAt:desc» → сортировка. */
export function parseMobileSort(v: string): Sorting {
  const [col, dir] = v.split(":");
  return { sortBy: col as UserSortBy, sortDir: dir as SortDir };
}

/** Страница полная — значит, следующая, возможно, есть (сервер не отдаёт общее число). */
export function hasNextPage(rowCount: number): boolean {
  return rowCount >= USERS_PAGE_SIZE;
}
