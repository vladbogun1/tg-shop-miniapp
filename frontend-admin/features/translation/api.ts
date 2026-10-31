/**
 * Переводы контента (docs/CONTENT-I18N.md): единственное место путей `/api/admin/translations/**`.
 * Ответы — типы из OpenAPI; экспорт приводится к `TrExportItem` (перечисления вместо `string`).
 */
import type { Schemas } from "@shop/core/api/schemas";
import { apiDelete, apiGet, apiPut } from "@/lib/api";
import type { TrAcceptItem, TrEntityType, TrExportItem, TrImportItem, TrLocale, TrOrigin, TrStatus } from "./model/types";

export type TrImportResult = Schemas["ImportResult"];
export type TrRejected = Schemas["Rejected"];
export type TrCounts = Schemas["TranslationCounts"];
export type TrTextCounts = Schemas["TextCounts"];
export type TrStats = Schemas["Stats"];
export type TrAcceptResult = Schemas["TranslationAcceptResult"];
export type TrSourceFixResult = Schemas["SourceFixResult"];

export type TrExportFilter = "missing" | "stale" | "translated" | "all";

export interface TrImportBody {
  locale: TrLocale;
  origin: TrOrigin;
  force?: boolean;
  items: TrImportItem[];
}

export interface TrSourceFixBody {
  items: { entityType: string; entityId: string; field: string; sourceHash: string }[];
  source: string;
  translations: Partial<Record<TrLocale, string>>;
}

function toExportItem(r: Schemas["ExportItem"]): TrExportItem {
  return {
    ...r,
    entityType: r.entityType as TrEntityType,
    status: r.status as TrStatus,
    origin: (r.origin ?? null) as TrOrigin | null,
    text: r.text ?? null,
    productId: r.productId ?? null,
    productTitle: r.productTitle ?? null,
    prevSource: r.prevSource ?? null,
  };
}

export const translationApi = {
  export: (locale: TrLocale, status: TrExportFilter = "all") =>
    apiGet<Schemas["ExportItem"][]>(`/api/admin/translations/export?locale=${locale}&status=${status}`).then((rows) =>
      rows.map(toExportItem)
    ),
  stats: () => apiGet<TrStats>("/api/admin/translations/stats"),
  import: (body: TrImportBody) => apiPut<TrImportResult>("/api/admin/translations/import", body),
  /** Mark translations as checked; a stale one is re-bound to the current source. */
  accept: (items: TrAcceptItem[]) => apiPut<TrAcceptResult>("/api/admin/translations/accept", { items }),
  /** Reset one field of one language (the Russian original is shown again). */
  reset: (locale: TrLocale, entityType: string, entityId: string, field: string) =>
    apiDelete<Schemas["DeleteResult"]>(
      `/api/admin/translations?locale=${locale}&entityType=${entityType}&entityId=${entityId}&field=${encodeURIComponent(field)}`
    ),
  /** Proofreading: replace the Russian source (optimistic by sourceHash) + write uk/en of the new text. */
  sourceFix: (body: TrSourceFixBody) => apiPut<TrSourceFixResult>("/api/admin/translations/source-fix", body),
};
