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

/**
 * Сверка с итогом документа, как её вёл сервер: сколько раз ИИ перечитывал накладную и какие строки код убрал как
 * повтор на стыке скринов. Сама сумма на экране считается из строк заново (`draftSum`) — админ мог добавить/убрать строку.
 */
export interface DraftSumInfo {
  /** Сколько раз ИИ перечитал накладную, чтобы сошлось с итогом (сам + кнопка «Перечитать»). */
  rereads: number;
  /** Строки, которые код убрал как повтор на стыке скринов (текстом, для подсказки). */
  removedRepeats: string[];
}

/** Строка, которую админ дописал сам (её нет в прочитанном): id у сервера — «M1», «M2»… */
export interface ManualLine {
  text: string;
  variant: string | null;
  qty: number;
  unitPrice: number | null;
}

export type SupplyDraft = Omit<Schemas["DraftDto"], "rows" | "doc" | "cards" | "sum"> & {
  rows: ReviewRow[];
  doc: ExtractedDoc | null;
  cards: Record<string, DraftCard>;
  /** Нет у старого сервера — экран считает без неё. */
  sum?: DraftSumInfo;
};

/** Правки экрана проверки; пустое поле — не менять. `supplierId: 0` — новый поставщик по `supplierName`. */
export type DraftSave = Omit<Schemas["DraftSaveRequest"], "decisions" | "addLines"> & {
  decisions?: Record<string, LineDecision>;
  /** Дописать строки (их нет в прочитанном) — встанут в конец нерешёнными. */
  addLines?: ManualLine[];
  /** Убрать строки из документа (лишний повтор, чужая позиция) — в отличие от «Пропустить», не входят в сумму. */
  removeLines?: string[];
};

export const draftsApi = {
  list: () => apiGet<DraftSummary[]>(BASE),
  get: (id: number) => apiGet<SupplyDraft>(`${BASE}/${id}`),
  create: (fileIds: number[]) => apiPost<SupplyDraft>(BASE, { fileIds }),
  sameInvoice: (fileIds: number[]) => apiGet<SameInvoice[]>(`${BASE}/same-invoice?fileIds=${fileIds.join(",")}`),
  save: (id: number, body: DraftSave) => apiPut<SupplyDraft>(`${BASE}/${id}`, body),
  retry: (id: number) => apiPost<SupplyDraft>(`${BASE}/${id}/retry`, {}),
  /** ИИ перечитывает накладную внимательнее и дописывает пропущенные строки (решённые строки остаются). */
  reread: (id: number) => apiPost<SupplyDraft>(`${BASE}/${id}/reread`, {}),
  stop: (id: number) => apiPost<SupplyDraft>(`${BASE}/${id}/stop`, {}),
  accept: (id: number, version: number) => apiPost<Schemas["DraftAcceptResult"]>(`${BASE}/${id}/accept`, { version }),
  remove: (id: number) => apiDelete<void>(`${BASE}/${id}`),
};
