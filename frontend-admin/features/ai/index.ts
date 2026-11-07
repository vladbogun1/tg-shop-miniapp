/**
 * Публичный вход фичи «ИИ в админке»: этап 1 — состояние и настройки владельца; для экранов следующих этапов —
 * API задач, запросы с опросом и чистая логика состояний.
 */
export { AiSettingsPanel } from "./ui/AiSettingsPanel";
export { AiUnavailable } from "./ui/AiUnavailable";
export { AiEntryButton } from "./ui/AiEntryButton";
export { AiJobSheet, type AiJobSheetProps } from "./ui/AiJobSheet";
export { AiReview, Notice as AiNotice, type AiReviewProps } from "./ui/AiReview";
export type { MenuItem as AiMenuItem } from "./ui/review/ReviewMenu";
export { AiStatusChip } from "./ui/AiStatusChip";
export { JobProgress as AiJobProgress } from "./ui/JobProgress";
export { JobFailure as AiJobFailure } from "./ui/JobFailure";
export { newIdemKey } from "./model/idem";
export { aiApi } from "./api";
export type {
  AiEstimate,
  AiEstimateRequest,
  AiFeature,
  AiJob,
  AiSummary,
  CardJobStart,
  AiJobMode,
  AiJobStart,
  AiJobStatus,
  AiOutcome,
  AiState,
} from "./api";
export { aiKeys } from "./keys";
export { useAiEstimate, useAiJob, useAiJobs, useAiState, useAiSummary, useCancelJob, useJobOutcome, useRetryJob } from "./queries";
export { AI_GROUP } from "./model/setting-keys";
export { canCancel, canRetry, isActive, isDisappointing, pollInterval, statusLabel, statusTone } from "./model/job-state";
export { uahFromMinor, usdFromCents, usdFromMicro } from "./model/format";
export {
  applicable,
  buildGroups,
  counts,
  initialSelection,
  outcomeCounts,
  toggled,
  type GroupId,
  type OutcomeCounts,
  type ReviewField,
} from "./model/review-model";
export { plausibility, plausibilityReason } from "./model/plausibility";
export { conflictText, conflictWithoutSnapshot, editedBanner, mostlyConflicted } from "./model/conflict";
export type { EditorView, FieldChangeView } from "./model/conflict";
export { reviewState, reviewStateLabel } from "./model/job-state";
export { AiTaskCenter } from "./ui/AiTaskCenter";
export { AiMetrics } from "./ui/AiMetrics";
export { AiDashboardWidget } from "./ui/AiDashboardWidget";
export { useAiMetrics, useAiTasks, useAiWidget, useMarkManual } from "./queries-center";
export type { AiTaskTab, AiTaskRow, AiTaskPage, AiWidgetData, AiMetricsSummary } from "./api";

// Этап Э4: пакеты.
export { batchApi } from "./api-batch";
export type { AiBatch, AiBatchRow, AiSafeApplied } from "./api-batch";
export { BatchGate, BatchPanel } from "./ui/batch/BatchPanel";
export { BatchConfirm } from "./ui/batch/BatchConfirm";
export { QuickReviewFeed } from "./ui/batch/QuickReviewFeed";
export { AcceptSafeDialog } from "./ui/batch/AcceptSafeDialog";
export { useAiBatches, useAiBatchById, useAiFinanceFlag, useRetryFailedBatch, hasOpenBatch, invalidateAfterBatch } from "./queries-batch";
export { aboutDuration, unavailableReason } from "./model/availability";
export { isOpen as isBatchOpen } from "./model/batch-view";
export { isSafeKey } from "./model/batch-view";
