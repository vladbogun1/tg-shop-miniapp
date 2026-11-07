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
  searchTest: (query: string) => apiPost<AiSearchFound>("/api/admin/ai/search-test", { query }),
  stopRunning: () => apiPost<{ stopped: number }>("/api/admin/ai/stop-running"),

  /** `idemKey` — один на нажатие кнопки: повтор того же запроса вернёт ту же задачу, а не вторую. */
  start: (body: AiJobStart, idemKey: string) => apiPost<AiJob>("/api/admin/ai/jobs", body, { "Idempotency-Key": idemKey }),
  job: (id: number) => apiGet<AiJob>(`/api/admin/ai/jobs/${id}`),
  /** Задачи в очереди и в работе, новые сверху, без текстов. */
  active: () => apiGet<AiJob[]>("/api/admin/ai/jobs/active"),
  cancel: (id: number) => apiPost<AiJob>(`/api/admin/ai/jobs/${id}/cancel`),
  retry: (id: number) => apiPost<AiJob>(`/api/admin/ai/jobs/${id}/retry`),
  outcome: (id: number, outcome: AiOutcome) => apiPost<AiJob>(`/api/admin/ai/jobs/${id}/outcome`, outcome),
  estimate: (body: AiEstimateRequest) => apiPost<AiEstimate>("/api/admin/ai/estimate", body),
};
