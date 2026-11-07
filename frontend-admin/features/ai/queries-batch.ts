"use client";

/**
 * Запросы пакетов ИИ. Идущие пакеты — опрос раз в 4 с, пока что-то идёт (пауза и итог ждут не торопясь).
 * Записи (пауза, продолжить, отмена, повтор неудачных, отмена применения) обновляют полосу, сводку и центр задач.
 */
import { STALE_TIME } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery } from "@tanstack/react-query";
import { batchApi, type AiBatch } from "./api-batch";
import type { AiFeature } from "./api";
import { aiKeys } from "./keys";
import { isOpen } from "./model/batch-view";
import { JOB_POLL_HIDDEN_MS, JOB_POLL_MS } from "./model/job-state";

const AFTER_BATCH = [aiKeys.batches(), aiKeys.active(), aiKeys.summary(), aiKeys.tasksAll(), aiKeys.widget()];

/** Пакеты, о которых полосе есть что сказать. Опрос частый, пока хоть один идёт. */
export function useAiBatches() {
  return useQuery({
    queryKey: aiKeys.batches(),
    queryFn: batchApi.active,
    retry: false,
    staleTime: STALE_TIME.quick,
    refetchInterval: (q) => ((q.state.data ?? []).some((b: AiBatch) => b.status === "RUNNING") ? JOB_POLL_MS : JOB_POLL_HIDDEN_MS),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export const hasOpenBatch = (list: readonly AiBatch[] | undefined): boolean => (list ?? []).some(isOpen);

/** Оценка пакета: минуты всем, деньги — только финансисту (сервер сам не отдаёт остальным). */
export function useBatchEstimate(feature: AiFeature, count: number, enabled: boolean) {
  return useQuery({
    queryKey: aiKeys.batchEstimate(feature, count),
    queryFn: () => batchApi.estimate(feature, count),
    enabled: enabled && count > 0,
    staleTime: STALE_TIME.minute,
    retry: false,
  });
}

export function usePauseBatch() {
  return useApiMutation({ mutationFn: (id: number) => batchApi.pause(id), invalidate: AFTER_BATCH, errorFallback: "Не удалось остановить пакет" });
}

export function useResumeBatch() {
  return useApiMutation({ mutationFn: (id: number) => batchApi.resume(id), invalidate: AFTER_BATCH, errorFallback: "Не удалось продолжить пакет" });
}

export function useCancelBatch() {
  return useApiMutation({
    mutationFn: (id: number) => batchApi.cancel(id),
    invalidate: AFTER_BATCH,
    success: "Пакет остановлен: что уже готово, останется на проверку",
    errorFallback: "Не удалось отменить пакет",
  });
}

export function useRetryFailedBatch() {
  return useApiMutation({
    mutationFn: ({ id, idemKey }: { id: number; idemKey: string }) => batchApi.retryFailed(id, idemKey),
    invalidate: AFTER_BATCH,
    errorFallback: "Не удалось повторить неудачные",
  });
}

export function useUndoBatch() {
  return useApiMutation({
    mutationFn: (id: number) => batchApi.undoBatch(id),
    invalidate: AFTER_BATCH,
    success: (r) => `Применение отменено: возвращено полей — ${r.reverted}${r.skipped > 0 ? `, оставлено (правили вручную) — ${r.skipped}` : ""}`,
    errorFallback: "Не удалось отменить применение",
  });
}

export const invalidateAfterBatch = AFTER_BATCH;
