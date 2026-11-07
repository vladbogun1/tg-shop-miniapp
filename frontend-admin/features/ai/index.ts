/**
 * Публичный вход фичи «ИИ в админке»: этап 1 — состояние и настройки владельца; для экранов следующих этапов —
 * API задач, запросы с опросом и чистая логика состояний.
 */
export { AiSettingsPanel } from "./ui/AiSettingsPanel";
export { AiUnavailable } from "./ui/AiUnavailable";
export { aiApi } from "./api";
export type {
  AiEstimate,
  AiEstimateRequest,
  AiFeature,
  AiJob,
  AiJobMode,
  AiJobStart,
  AiJobStatus,
  AiOutcome,
  AiState,
} from "./api";
export { aiKeys } from "./keys";
export { useAiJob, useAiJobs, useAiState } from "./queries";
export { AI_GROUP } from "./model/setting-keys";
export { canCancel, canRetry, isActive, isDisappointing, pollInterval, statusLabel, statusTone } from "./model/job-state";
export { uahFromMinor, usdFromCents, usdFromMicro } from "./model/format";
