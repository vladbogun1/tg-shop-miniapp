import type { Schemas } from "@shop/core/api/schemas";
import { apiGet, apiPost } from "@/lib/http";
import type { AiFeature } from "./api";

export type AiBatch = Schemas["AiBatchDto"];
export type AiBatchRow = Schemas["AiAiBatchDtoRow"];
export type AiBatchEstimate = Schemas["Dto"];
export type AiBatchPause = NonNullable<AiBatch["pauseReason"]>;
export type AiSafeApplied = Schemas["AiAiSafeAcceptApplied"];
export type AiUndoResult = Schemas["AiAiApplyUndoResult"];
/** Неотменённое применение задачи: id и до какого времени его можно отменить; id null — отменять нечего. */
export type AiApplyLive = Schemas["AiAiApplyUndoLive"];
/** SAFE — «Принять безопасное» (сервер сверяет обещание), SINGLE — обычное применение одной карточки. */
export type AiApplyKind = "SAFE" | "SINGLE";
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
  /** Обычное применение результата (экран проверки, «Принять» в ленте): тот же журнал, отмена — 24 часа. */
  applyBeginSingle: (jobId: number) => apiPost<{ id: number }>(`${BASE}/jobs/${jobId}/apply/begin`),
  applyLive: (jobId: number) => apiGet<AiApplyLive>(`${BASE}/jobs/${jobId}/apply`),
  applyFinish: (applyId: number) => apiPost<AiSafeApplied>(`${BASE}/apply/${applyId}/finish`),
  undoOne: (applyId: number) => apiPost<AiUndoResult>(`${BASE}/apply/${applyId}/undo`),
  undoBatch: (id: number) => apiPost<AiUndoResult>(`${BASE}/batches/${id}/accept-safe/undo`),
};

/**
 * Запись результата задачи в рамке журнала применений: сервер снимает значения до (`begin`) и сравнивает после
 * (`finish`), поэтому применение можно отменить 24 часа. `finish` зовётся и при сбое записи — незакрытая запись
 * не должна висеть; сбой записи потом пробрасывается.
 */
export async function inApplyLog<T>(jobId: number, kind: AiApplyKind, write: () => Promise<T>): Promise<{ value: T; applied: AiSafeApplied }> {
  const begun = kind === "SAFE" ? await batchApi.applyBegin(jobId) : await batchApi.applyBeginSingle(jobId);
  let value: T | undefined;
  let failure: unknown = null;
  try {
    value = await write();
  } catch (e) {
    failure = e;
  }
  const applied = await batchApi.applyFinish(begun.id);
  if (failure) throw failure;
  return { value: value as T, applied };
}
