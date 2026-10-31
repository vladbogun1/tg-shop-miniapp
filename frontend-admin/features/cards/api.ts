/**
 * «Карточки» — единственное место путей `/api/admin/cards/*`, `…/products/{id}/{card-status,active}`,
 * `…/spec-attributes/{id}` и `…/catalog/schema` в виде схемы карточек (docs/CATALOG-SPECS.md §3.4).
 * Ответы — типы из OpenAPI (`Schemas[...]`); журнал карточки (`card_meta`) в OpenAPI — произвольный объект,
 * его форма описана в `model/meta.ts`.
 */
import type { Schemas } from "@shop/core/api/schemas";
import { apiGet, apiPatch, apiPut } from "@/lib/api";
import type { CardItem, CardStatusCode } from "./model/item";
import type { CardLast, CardReviewData } from "./model/meta";
import { normalizeSchema, type CardSchema } from "./model/schema";
import type { CardAcceptBody, CardImportRequest, SpecOptionWrite } from "./model/wire";

export type CardStats = Schemas["CardsStats"];
/** Итог записи ответа ИИ. `missing`/`message` бэкенд пока не присылает — интерфейс читает их, если появятся. */
export type CardImportItemResult = Schemas["CardItemResult"] & { missing?: string[] | null; message?: string | null };
export type CardImportResult = Omit<Schemas["CardsImportResult"], "items"> & { items: CardImportItemResult[] };

export type CardExportStatus = "draft" | "ai_filled" | "incomplete" | "unfinished" | "all";


/** Выгрузка товаров с данными карточки (`CardExportItem`) — в виде, который читают модель и экраны. */
const toItem = (d: Schemas["CardExportItem"]): CardItem => d;

export const cardsApi = {
  stats: (): Promise<CardStats> => apiGet<CardStats>("/api/admin/cards/stats"),

  async export(status: CardExportStatus = "all", ids?: string[]): Promise<CardItem[]> {
    const qs = new URLSearchParams({ status });
    if (ids?.length) qs.set("ids", ids.join(","));
    return (await apiGet<Schemas["CardExportItem"][]>(`/api/admin/cards/export?${qs}`)).map(toItem);
  },

  import: (body: CardImportRequest): Promise<CardImportResult> => apiPut<CardImportResult>("/api/admin/cards/import", body satisfies Schemas["CardsImportRequest"]),

  async review(productId: string): Promise<CardReviewData> {
    const o = await apiGet<Schemas["CardReview"]>(`/api/admin/cards/${productId}/review`);
    return {
      item: toItem(o.item),
      last: (o.last as CardLast | null) ?? null,
      importedAt: o.importedAt ?? null,
      reviewedAt: o.reviewedAt ?? null,
      reviewedBy: o.reviewedBy ?? null,
      reviewedByName: o.reviewedByName?.trim() ? o.reviewedByName : null,
      translations: {
        uk: (o.translations?.uk ?? {}) as CardReviewData["translations"]["uk"],
        en: (o.translations?.en ?? {}) as CardReviewData["translations"]["en"],
      },
    };
  },

  accept: (productId: string, body: CardAcceptBody = {}): Promise<CardImportResult> =>
    apiPut<CardImportResult>(`/api/admin/cards/${productId}/accept`, body satisfies Schemas["CardAcceptRequest"]),

  setCardStatus: (productId: string, status: CardStatusCode): Promise<unknown> =>
    apiPatch(`/api/admin/products/${productId}/card-status`, { status } satisfies Schemas["CardStatusRequest"]),

  /** Storefront visibility (PATCH /api/admin/products/{id}/active). */
  setActive: (productId: string, active: boolean): Promise<unknown> => apiPatch(`/api/admin/products/${productId}/active`, { active }),

  /**
   * Sets the price of a product from the completion modal. PATCH /api/admin/products/{id} is a
   * full upsert for the scalars (description is overwritten, null price = 0), so title and
   * description are sent as they are now; images, variants, stock and catalog fields are kept (null).
   */
  setPrice: (item: { id: string; title: string; description?: string | null }, priceMinor: number): Promise<unknown> =>
    apiPatch(`/api/admin/products/${item.id}`, { title: item.title, description: item.description ?? "", priceMinor }),

  /** Full multilingual schema (GET /api/admin/catalog/schema), normalized for prompt and check. */
  async schema(): Promise<CardSchema> {
    return normalizeSchema(await apiGet<unknown>("/api/admin/catalog/schema"));
  },

  /** Replaces the option list of an attribute (used by «Добавить опцию в схему»). */
  updateAttributeOptions: (attributeId: string, options: SpecOptionWrite[]): Promise<unknown> =>
    apiPatch(`/api/admin/spec-attributes/${attributeId}`, { options }),
};
