"use client";

/**
 * Запросы пакетов ИИ. Идущие пакеты — опрос раз в 4 с, пока что-то идёт (пауза и итог ждут не торопясь).
 * Записи (пауза, продолжить, отмена, повтор неудачных, отмена применения) обновляют полосу, сводку и центр задач.
 */
import { QUERY_PRESETS, STALE_TIME } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import { isAuthenticated } from "@/lib/session";
import { batchApi, type AiBatch, type AiUndoResult } from "./api-batch";
import type { AiFeature } from "./api";
import { aiKeys } from "./keys";
import { isOpen } from "./model/batch-view";
import { undoneText } from "./model/undo-fields";
import { JOB_POLL_HIDDEN_MS, JOB_POLL_MS } from "./model/job-state";

const AFTER_BATCH = [aiKeys.batches(), aiKeys.active(), aiKeys.summary(), aiKeys.tasksAll(), aiKeys.widget()];
/** После отмены применения задача снова ждёт проверки: и пакеты, и сама задача, и её «живое» применение. */
const AFTER_UNDO = [...AFTER_BATCH, aiKeys.jobsAll(), aiKeys.applyLiveAll()];


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

/** Один пакет по номеру (в `active` законченный без дел не попадает): опрос, пока он идёт. `null` — пакета нет. */
export function useAiBatchById(id: number | null) {
  return useQuery({
    queryKey: aiKeys.batch(id ?? 0),
    queryFn: () => batchApi.get(id ?? 0),
    enabled: id !== null,
    retry: false,
    staleTime: STALE_TIME.quick,
    refetchInterval: (q) => (q.state.data && isOpen(q.state.data) ? JOB_POLL_MS : false),
  });
}

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
    invalidate: AFTER_UNDO,
    success: undoneText,
    errorFallback: "Не удалось отменить применение",
  });
}

export const invalidateAfterBatch = AFTER_BATCH;
export const invalidateAfterUndo = AFTER_UNDO;

/** Неотменённое применение задачи (экран проверки: «Отменить применение»). */
export function useApplyLive(jobId: number | null) {
  return useQuery({
    queryKey: aiKeys.applyLive(jobId ?? 0),
    queryFn: () => batchApi.applyLive(jobId ?? 0),
    enabled: jobId !== null && isAuthenticated(),
    staleTime: STALE_TIME.quick,
  });
}

/** Отменить несколько применений (свои из окна «Принять безопасное»), по одному; итог — сумма. */
export function useUndoApplications() {
  return useApiMutation({
    mutationFn: async (ids: readonly number[]): Promise<AiUndoResult> => {
      let sum: AiUndoResult = { applications: 0, reverted: 0, skipped: 0, revertedFields: [], skippedFields: [] };
      for (const id of ids) sum = plusUndo(sum, await batchApi.undoOne(id));
      return sum;
    },
    invalidate: AFTER_UNDO,
    success: undoneText,
    errorFallback: "Не удалось отменить применение",
  });
}

const distinct = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])];

function plusUndo(a: AiUndoResult, b: AiUndoResult): AiUndoResult {
  return {
    applications: a.applications + b.applications,
    reverted: a.reverted + b.reverted,
    skipped: a.skipped + b.skipped,
    revertedFields: distinct(a.revertedFields, b.revertedFields),
    skippedFields: distinct(a.skippedFields, b.skippedFields),
  };
}

/** Отменить одно применение: поля вернутся, задача снова на проверке. */
/** `toast: false` — итог показывает сам экран (`ApplyUndoReport`), тост бы его повторил. */
export function useUndoApplication(opts: { toast?: boolean } = {}) {
  return useApiMutation({
    mutationFn: (applyId: number) => batchApi.undoOne(applyId),
    invalidate: AFTER_UNDO,
    success: opts.toast === false ? undefined : undoneText,
    errorFallback: "Не удалось отменить применение",
  });
}

/**
 * Видит ли админ деньги (финансист). Тот же запрос, что у `useFinanceAccess` в «Закупке»: фича `ai` не
 * зависит от `procurement` (иначе замыкается цикл через каталог и переводы).
 */
export function useAiFinanceFlag(): boolean {
  const q = useQuery({
    queryKey: aiKeys.financeFlag(),
    queryFn: () => apiGet<{ finance: boolean }>("/api/admin/costing/access"),
    enabled: isAuthenticated(),
    staleTime: QUERY_PRESETS.static.staleTime,
    retry: false,
  });
  return q.data?.finance === true;
}
