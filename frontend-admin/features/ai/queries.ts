"use client";

/**
 * Запросы и записи встроенного ИИ. Состояние (деньги, лимиты, поиск) — только для финансового доступа: сервер
 * отвечает остальным 403, поэтому его читает только панель в настройках, которую они не видят.
 * Задачи (`useAiJob`, `useAiJobs`) — для экранов этапов: опрос идёт, пока задача активна.
 */
import { QUERY_PRESETS, STALE_TIME } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { aiApi, type AiEstimateRequest, type AiOutcome } from "./api";
import { aiKeys } from "./keys";
import { JOB_POLL_HIDDEN_MS, JOB_POLL_MS, pollInterval } from "./model/job-state";

export function useAiState() {
  return useQuery({ queryKey: aiKeys.state(), queryFn: aiApi.state, staleTime: QUERY_PRESETS.live.staleTime, retry: false });
}

/** Одна проба поиска: результат нужен экрану, поэтому мутация, а не запрос. */
export function useSearchTest() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (query: string) => aiApi.searchTest(query),
    errorFallback: "Не удалось проверить поиск",
    onSuccess: () => {
      // Серверный перерыв провайдера мог начаться или кончиться.
      void qc.invalidateQueries({ queryKey: aiKeys.state() });
    },
  });
}

export function useStopRunning() {
  return useApiMutation({
    mutationFn: () => aiApi.stopRunning(),
    invalidate: [aiKeys.state(), aiKeys.active()],
    success: (r) => (r.stopped === 0 ? "Идущих задач не было" : `Остановлено задач: ${r.stopped}`),
    errorFallback: "Не удалось остановить",
  });
}

/** Вкладка видна: опрос идущей задачи раз в 4 с, в фоне раз в минуту (возврат на вкладку обновляет сам react-query). */
function useTabVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/** Задача с ответом; пока она идёт — опрос (см. `pollInterval`). */
export function useAiJob(id: number | null) {
  const visible = useTabVisible();
  return useQuery({
    queryKey: aiKeys.job(id ?? 0),
    queryFn: () => aiApi.job(id as number),
    enabled: id != null,
    refetchInterval: (q) => pollInterval(q.state.data, visible),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/** Очередь и работающие задачи, без текстов. */
export function useAiJobs() {
  return useQuery({ queryKey: aiKeys.active(), queryFn: aiApi.active, ...QUERY_PRESETS.live });
}

/**
 * Сводка без денег для всех админов: чип в шапке и кнопки входа. Раз в 4 с, пока что-то идёт и вкладка видна;
 * иначе раз в минуту; плюс фокус и возврат сети.
 */
export function useAiSummary() {
  const visible = useTabVisible();
  return useQuery({
    queryKey: aiKeys.summary(),
    queryFn: aiApi.summary,
    retry: false,
    staleTime: STALE_TIME.quick,
    refetchInterval: (q) => {
      if (!visible) return JOB_POLL_HIDDEN_MS;
      return (q.state.data?.running ?? 0) > 0 ? JOB_POLL_MS : JOB_POLL_HIDDEN_MS;
    },
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/** Оценка «около минуты» и деньги (деньги сервер отдаёт всем, показываем только финансистам). */
export function useAiEstimate(req: AiEstimateRequest | null) {
  return useQuery({
    queryKey: aiKeys.estimate(req ? `${req.feature}:${req.mode ?? "NORMAL"}:${req.items ?? 1}` : "none"),
    queryFn: () => aiApi.estimate(req as AiEstimateRequest),
    enabled: req != null,
    staleTime: STALE_TIME.minute,
    retry: false,
  });
}

const AFTER_JOB = [aiKeys.active(), aiKeys.summary()];

export function useCancelJob() {
  return useApiMutation({
    mutationFn: (id: number) => aiApi.cancel(id),
    invalidate: AFTER_JOB,
    errorFallback: "Не удалось остановить",
  });
}

export function useRetryJob() {
  return useApiMutation({
    mutationFn: (id: number) => aiApi.retry(id),
    invalidate: AFTER_JOB,
    errorFallback: "Не удалось повторить",
  });
}

/** После применения или отклонения: серверу — счётчики, чтобы задача перестала считаться «ждёт проверки». */
export function useJobOutcome() {
  return useApiMutation({
    mutationFn: ({ id, outcome }: { id: number; outcome: AiOutcome }) => aiApi.outcome(id, outcome),
    invalidate: AFTER_JOB,
    toastOnError: false,
  });
}
