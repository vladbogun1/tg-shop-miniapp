"use client";

/**
 * Запросы центра ИИ-задач, виджета дашборда, метрик и отметки ручного пути. Отдельно от `queries.ts`, где живёт
 * опрос одной задачи: здесь списки и итоги. Метрики — только финансистам (остальным сервер ответит 403), поэтому
 * экран метрик не рисуется без права «Финансы».
 */
import { QUERY_PRESETS, STALE_TIME } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { aiApi, type AiFeature, type AiTaskTab } from "./api";
import { aiKeys } from "./keys";
import { JOB_POLL_MS } from "./model/job-state";

export const TASKS_PAGE_SIZE = 20;

/** Список задач одной вкладки; «Идут» обновляется сам, пока открыта страница. */
export function useAiTasks(tab: AiTaskTab, page: number, enabled = true) {
  return useQuery({
    queryKey: aiKeys.tasks(tab, page),
    queryFn: () => aiApi.tasks(tab, page, TASKS_PAGE_SIZE),
    enabled,
    placeholderData: keepPreviousData,
    ...QUERY_PRESETS.live,
    refetchInterval: tab === "active" ? JOB_POLL_MS : false,
  });
}

/** Строка виджета: «Расход …» финансисту, «ИИ можно запускать» админу. */
export function useAiWidget() {
  return useQuery({ queryKey: aiKeys.widget(), queryFn: aiApi.widget, retry: false, staleTime: STALE_TIME.quick });
}

export function useAiMetrics(from: string, to: string) {
  return useQuery({
    queryKey: aiKeys.metrics(from, to),
    queryFn: () => aiApi.metrics(from, to),
    staleTime: STALE_TIME.quick,
    retry: false,
  });
}

/** По дням для графика: просим, только когда владелец раскрыл «Подробнее». */
export function useAiMetricsDays(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: aiKeys.series("day", from, to),
    queryFn: () => aiApi.metricsSeries("day", from, to),
    enabled,
    staleTime: STALE_TIME.quick,
    retry: false,
  });
}

/**
 * Админ применил результат вручную (через ChatGPT): говорим серверу, иначе доля встроенного ИИ всегда 100 %.
 * Тихо: сбой отметки не должен мешать сохранению карточки.
 */
export function useMarkManual() {
  return useApiMutation({
    mutationFn: ({ feature, subjectIds }: { feature: AiFeature; subjectIds: string[] }) => aiApi.markManual(feature, subjectIds),
    toastOnError: false,
  });
}
