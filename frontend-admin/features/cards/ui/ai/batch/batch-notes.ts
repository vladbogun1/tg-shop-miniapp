"use client";

/**
 * Заметки записи по пакету за эту сессию: чего сервер не принял (отброшенные поля), какие бренды завёл, какие
 * карточки не записались и почему. Сервер хранит только итог задачи (принято / отклонено), поэтому подробности
 * записи живут здесь — в кэше запросов, чтобы их видели и лента, и итог пакета, где бы они ни были открыты.
 */
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

export interface BatchNote {
  jobId: number;
  productId: string;
  kind: "error" | "dropped" | "brand";
  text: string;
}

const keyOf = (batchId: number) => ["admin", "ai-batch-notes", batchId] as const;

export function addBatchNotes(qc: QueryClient, batchId: number, notes: readonly BatchNote[]): void {
  if (!notes.length) return;
  qc.setQueryData<BatchNote[]>(keyOf(batchId), (prev = []) => [...prev, ...notes]);
}

export function useBatchNotes(batchId: number): BatchNote[] {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: keyOf(batchId),
    queryFn: () => qc.getQueryData<BatchNote[]>(keyOf(batchId)) ?? [],
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return q.data ?? [];
}
