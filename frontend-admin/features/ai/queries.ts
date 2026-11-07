"use client";

/**
 * Запросы и записи встроенного ИИ. Состояние (деньги, лимиты, поиск) — только для финансового доступа: сервер
 * отвечает остальным 403, поэтому его читает только панель в настройках, которую они не видят.
 * Задачи (`useAiJob`, `useAiJobs`) — для экранов этапов: опрос идёт, пока задача активна.
 */
import { QUERY_PRESETS } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { aiApi } from "./api";
import { aiKeys } from "./keys";
import { pollInterval } from "./model/job-state";

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

/** Задача с ответом; пока она идёт — опрос раз в две секунды. */
export function useAiJob(id: number | null) {
  return useQuery({
    queryKey: aiKeys.job(id ?? 0),
    queryFn: () => aiApi.job(id as number),
    enabled: id != null,
    refetchInterval: (q) => pollInterval(q.state.data),
  });
}

/** Очередь и работающие задачи, без текстов. */
export function useAiJobs() {
  return useQuery({ queryKey: aiKeys.active(), queryFn: aiApi.active, ...QUERY_PRESETS.live });
}
