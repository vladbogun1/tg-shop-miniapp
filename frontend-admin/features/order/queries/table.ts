"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { orderApi } from "../api";
import { orderKeys } from "../keys";
import type { OrdersPeriod } from "../model/period";
import { TABLE_SIZE, type OrderSortBy, type StatusFilter } from "../model/table";
import type { SortDir } from "@/lib/sort";

export interface TableParams {
  search: string;
  period: OrdersPeriod;
  status: StatusFilter;
  page: number;
  sortBy: OrderSortBy;
  sortDir: SortDir;
  archived: boolean;
}

export function useOrdersTableQuery(p: TableParams) {
  return useQuery({
    queryKey: orderKeys.tableFilter(p.search, p.period, p.status, p.page, p.sortBy, p.sortDir, p.archived),
    queryFn: () =>
      orderApi.list({
        archived: p.archived,
        q: p.search || undefined,
        period: p.period,
        status: p.status === "ALL" ? undefined : p.status,
        page: p.page,
        size: TABLE_SIZE,
        sortBy: p.sortBy,
        sortDir: p.sortDir,
      }),
    placeholderData: keepPreviousData,
  });
}
