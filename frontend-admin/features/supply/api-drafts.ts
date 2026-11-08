/**
 * «Поставка с ИИ» как черновик на сервере (`/api/admin/supply-drafts`): ИИ сам читает накладную, сопоставляет строки и
 * пишет карточки новых товаров; админ проверяет и принимает. Строки и документ сервер отдаёт в той же форме, что и
 * модель ручного пути (`model/ai/types` — логика перенесена на Java один в один), поэтому здесь они типизированы ею.
 */
import type { Schemas } from "@shop/core/api/schemas";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/http";
import type { ExtractedDoc, LineDecision, ReviewRow } from "./model/ai/types";
import type { SameInvoice } from "./model/drafts/same-invoice";

const BASE = "/api/admin/supply-drafts";

/** Карточка нового товара, как её написал ИИ (ru/uk/en — по ключу языка). */
export interface DraftCard {
  categoryId: string | null;
  brand: string | null;
  specs: Record<string, unknown>;
  overall: number | null;
  title: Record<string, string>;
  description: Record<string, string>;
  photos: string[];
  sources: string[];
  notes: string | null;
}

export type DraftJob = Schemas["DraftJobView"];
export type DraftSummary = Schemas["DraftSummary"];
export type DraftStatus = DraftSummary["status"];

export type SupplyDraft = Omit<Schemas["DraftDto"], "rows" | "doc" | "cards"> & {
  rows: ReviewRow[];
  doc: ExtractedDoc | null;
  cards: Record<string, DraftCard>;
};

/** Правки экрана проверки; пустое поле — не менять. `supplierId: 0` — новый поставщик по `supplierName`. */
export type DraftSave = Omit<Schemas["DraftSaveRequest"], "decisions"> & { decisions?: Record<string, LineDecision> };

export const draftsApi = {
  list: () => apiGet<DraftSummary[]>(BASE),
  get: (id: number) => apiGet<SupplyDraft>(`${BASE}/${id}`),
  create: (fileIds: number[]) => apiPost<SupplyDraft>(BASE, { fileIds }),
  sameInvoice: (fileIds: number[]) => apiGet<SameInvoice[]>(`${BASE}/same-invoice?fileIds=${fileIds.join(",")}`),
  save: (id: number, body: DraftSave) => apiPut<SupplyDraft>(`${BASE}/${id}`, body),
  retry: (id: number) => apiPost<SupplyDraft>(`${BASE}/${id}/retry`, {}),
  stop: (id: number) => apiPost<SupplyDraft>(`${BASE}/${id}/stop`, {}),
  accept: (id: number, version: number) => apiPost<Schemas["DraftAcceptResult"]>(`${BASE}/${id}/accept`, { version }),
  remove: (id: number) => apiDelete<void>(`${BASE}/${id}`),
};
