"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "./api";
import { inventoryKeys } from "./keys";
import type { WriteoffRange } from "./model/types";

export function useWriteoffReport(range: WriteoffRange) {
  return useQuery({ queryKey: inventoryKeys.report(range), queryFn: () => inventoryApi.report(range) });
}

/** Отчёты устарели (после «Вернуть на склад»). */
export function useInvalidateWriteoffs() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: inventoryKeys.all() });
}
