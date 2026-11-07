import type { Schemas } from "@shop/core/api/schemas";
import { apiGet, apiPost } from "@/lib/http";
import type { AiFeature } from "./api";

export type AiBatch = Schemas["AiBatchDto"];
export type AiBatchRow = Schemas["AiAiBatchDtoRow"];
export type AiBatchEstimate = Schemas["Dto"];
export type AiBatchPause = NonNullable<AiBatch["pauseReason"]>;
export type AiSafeApplied = Schemas["AiAiSafeAcceptApplied"];
export type AiUndoResult = Schemas["AiAiApplyUndoResult"];
/** Пакет карточек: у каждого товара свой промпт и отпечаток, их собирает фронт `features/cards`. */
export type CardBatchStart = { items: Required<Schemas["Product"]>[]; promptVersion: string };

const BASE = "/api/admin/ai";

export const batchApi = {
  /** «Сколько займёт и хватит ли лимита»: деньги в ответе только у админа с финансовым доступом. */
  estimate: (feature: AiFeature, count: number, mode: "NORMAL" | "THOROUGH" = "NORMAL") =>
    apiPost<AiBatchEstimate>(`${BASE}/batches/estimate`, { feature, count, mode }),
  /** Идущие, ждущие проверки, с неудачными и с неистёкшей отменой применения. */
  active: () => apiGet<AiBatch[]>(`${BASE}/batches/active`),
  get: (id: number) => apiGet<AiBatch>(`${BASE}/batches/${id}`),
  startCards: (body: CardBatchStart, idemKey: string) => apiPost<AiBatch>(`${BASE}/card-batches`, body, { "Idempotency-Key": idemKey }),
  pause: (id: number) => apiPost<AiBatch>(`${BASE}/batches/${id}/pause`),
  resume: (id: number) => apiPost<AiBatch>(`${BASE}/batches/${id}/resume`),
  cancel: (id: number) => apiPost<AiBatch>(`${BASE}/batches/${id}/cancel`),
  retryFailed: (id: number, idemKey: string) => apiPost<AiBatch>(`${BASE}/batches/${id}/retry-failed`, undefined, { "Idempotency-Key": idemKey }),
  applyBegin: (jobId: number) => apiPost<{ id: number }>(`${BASE}/batches/jobs/${jobId}/apply/begin`),
  applyFinish: (applyId: number) => apiPost<AiSafeApplied>(`${BASE}/apply/${applyId}/finish`),
  undoOne: (applyId: number) => apiPost<AiUndoResult>(`${BASE}/apply/${applyId}/undo`),
  undoBatch: (id: number) => apiPost<AiUndoResult>(`${BASE}/batches/${id}/accept-safe/undo`),
};
