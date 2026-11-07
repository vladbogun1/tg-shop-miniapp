import type { Schemas } from "@shop/core/api/schemas";
import { apiGet, apiPost } from "@/lib/http";

export type AiFeature = NonNullable<Schemas["CreateJob"]["feature"]>;
export type AiJobStatus = Schemas["AiJobDto"]["status"];
export type AiJobMode = Schemas["AiJobDto"]["mode"];
export type AiState = Schemas["State"];
export type AiMoney = Schemas["Money"];
export type AiSearchFound = Schemas["Found"];
export type AiSearchProvider = Schemas["ProviderState"];
export type AiEstimate = Schemas["EstimateDto"];
export type AiOutcome = Schemas["AiAiJobOutcome"];
export type AiSummary = Schemas["AiAiSummarySummary"];
export type AiTaskTab = "active" | "review" | "problems" | "history";
export type AiTaskRow = Schemas["AiAiTaskListRow"];
export type AiTaskPage = Schemas["TaskPage"];
export type AiWidgetData = Schemas["Widget"];
export type AiMetricsSummary = Schemas["AiSummary"];
export type AiMetricsRow = Schemas["AiRow"];
export type AiMetricsSeries = Schemas["Series"];
export type AiMetricsGroup = "day" | "feature" | "provider";

/** Запрос карточной задачи: товар, версия карточки и промпт собирает фронт (`features/cards`). */
export type CardJobStart = Required<Schemas["Start"]>;

/**
 * Задача ИИ. Деньги, токены, промпт и текст ошибки провайдера приходят только админу с доступом к финансам:
 * у остальных этих ключей в ответе нет (`?`). Пустые поля вместо `null` — как в OpenAPI.
 */
export type AiJob = Schemas["AiJobDto"];
export type AiJobStart = Omit<Schemas["CreateJob"], "feature" | "prompt"> & { feature: AiFeature; prompt: string };
export type AiEstimateRequest = Omit<Schemas["EstimateRequest"], "feature"> & { feature: AiFeature };

export const aiApi = {
  /** Только для финансового доступа: деньги, лимиты, поиск. */
  state: () => apiGet<AiState>("/api/admin/ai/state"),
  /** Лёгкая сводка для всех админов, без денег: чип в шапке и кнопки входа. */
  summary: () => apiGet<AiSummary>("/api/admin/ai/summary"),
  searchTest: (query: string) => apiPost<AiSearchFound>("/api/admin/ai/search-test", { query }),
  stopRunning: () => apiPost<{ stopped: number }>("/api/admin/ai/stop-running"),

  /** `idemKey` — один на нажатие кнопки: повтор того же запроса вернёт ту же задачу, а не вторую. */
  start: (body: AiJobStart, idemKey: string) => apiPost<AiJob>("/api/admin/ai/jobs", body, { "Idempotency-Key": idemKey }),
  startCard: (body: CardJobStart, idemKey: string) => apiPost<AiJob>("/api/admin/ai/card-jobs", body, { "Idempotency-Key": idemKey }),
  job: (id: number) => apiGet<AiJob>(`/api/admin/ai/jobs/${id}`),
  /** Задачи в очереди и в работе, новые сверху, без текстов. */
  active: () => apiGet<AiJob[]>("/api/admin/ai/jobs/active"),
  cancel: (id: number) => apiPost<AiJob>(`/api/admin/ai/jobs/${id}/cancel`),
  retry: (id: number) => apiPost<AiJob>(`/api/admin/ai/jobs/${id}/retry`),
  outcome: (id: number, outcome: AiOutcome) => apiPost<AiJob>(`/api/admin/ai/jobs/${id}/outcome`, outcome),
  estimate: (body: AiEstimateRequest) => apiPost<AiEstimate>("/api/admin/ai/estimate", body),
  /** Центр задач: вкладка, страница. Админ видит свои и чужие задачи без денег и промптов. */
  tasks: (tab: AiTaskTab, page: number, size: number) =>
    apiGet<AiTaskPage>(`/api/admin/ai/jobs?tab=${tab}&page=${page}&size=${size}`),
  widget: () => apiGet<AiWidgetData>("/api/admin/ai/widget"),
  /** Результат применён вручную (через ChatGPT): без отметки доля встроенного ИИ всегда 100 %. */
  markManual: (feature: AiFeature, subjectIds: string[]) =>
    apiPost<{ recorded: number }>("/api/admin/ai/manual-marks", { feature, subjectIds }),
  /** Метрики — только финансистам; `from`/`to` — даты yyyy-MM-dd, тестовый админ по умолчанию не считается. */
  metrics: (from: string, to: string) => apiGet<AiMetricsSummary>(`/api/admin/ai/metrics/summary?from=${from}&to=${to}`),
  metricsSeries: (groupBy: AiMetricsGroup, from: string, to: string) =>
    apiGet<AiMetricsSeries>(`/api/admin/ai/metrics?groupBy=${groupBy}&from=${from}&to=${to}`),
};
