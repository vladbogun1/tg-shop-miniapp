/**
 * Ручной путь через ChatGPT для карточек как задачи ИИ: вставленный ответ становится задачей `ai_jobs` (без модели и
 * денег, работает при выключенном ИИ), ручной пакет живёт на сервере — с черновиком экрана, поэтому продолжается с
 * любого устройства. Проверка, «Принять безопасное», отмена и исход — общий API задач ИИ (`@/features/ai`).
 */
import type { Schemas } from "@shop/core/api/schemas";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/http";
import type { AiJob } from "@/features/ai";

export type ManualBatch = Omit<Schemas["ManualBatchDto"], "draft"> & { draft: string | null };
export type ManualBatchStart = Required<Schemas["ManualCardBatchStart"]>;
export type ManualPartAnswers = Required<Schemas["ManualCardPart"]>;
export type ManualCardPaste = Required<Schemas["ManualCardPaste"]>;

const BASE = "/api/admin/ai";

export const manualApi = {
  start: (body: ManualBatchStart): Promise<ManualBatch> => apiPost<ManualBatch>(`${BASE}/card-manual-batches`, body),
  /** Незаконченный ручной пакет этого админа; null — его нет (204). */
  current: async (): Promise<ManualBatch | null> => (await apiGet<ManualBatch | undefined>(`${BASE}/card-manual-batches/current`)) ?? null,
  get: (id: number): Promise<ManualBatch> => apiGet<ManualBatch>(`${BASE}/card-manual-batches/${id}`),
  saveDraft: (id: number, draft: string): Promise<ManualBatch> =>
    apiPut<ManualBatch>(`${BASE}/card-manual-batches/${id}/draft`, { draft } satisfies Schemas["ManualDraft"]),
  answers: (id: number, body: ManualPartAnswers): Promise<ManualBatch> => apiPost<ManualBatch>(`${BASE}/card-manual-batches/${id}/answers`, body),
  finish: (id: number): Promise<ManualBatch> => apiPost<ManualBatch>(`${BASE}/card-manual-batches/${id}/finish`),
  discard: (id: number): Promise<ManualBatch> => apiDelete<ManualBatch>(`${BASE}/card-manual-batches/${id}`),
  /** Ответ на одну карточку — задача «готово, ждёт проверки». */
  single: (body: ManualCardPaste): Promise<AiJob> => apiPost<AiJob>(`${BASE}/card-manual-jobs`, body),
};
