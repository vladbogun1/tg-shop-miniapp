/**
 * «Карточки» API (docs/CATALOG-SPECS.md §3.4) — typed calls over the shared admin http client.
 * Response shapes are adapted here (the backend may wrap lists in {items} or name a field
 * slightly differently), so the screen only sees the normalized types.
 */
import { apiGet, apiPatch, apiPut } from "@/lib/api";
import { normalizeSchema, type CardItem, type CardSchema, type CardStatusCode } from "@/lib/card-prompt";

export interface CardStats {
  /** All DRAFT cards (hidden + on the storefront). */
  draft: number;
  aiFilled: number;
  ready: number;
  incomplete: number;
  /** Created via the short admin form, not yet published/archived (backend flag, V53). */
  unfinished: number;
}

export type CardExportStatus = "draft" | "ai_filled" | "incomplete" | "unfinished" | "all";

export interface CardImportItem {
  productId: string;
  categorySlug?: string;
  brand?: string;
  specs: Record<string, unknown>;
  confidence: Record<string, number>;
  overall?: number;
  description?: string;
  sources?: string[];
  notes?: string;
  model?: string;
  markReady: boolean;
  /** Put the product on the storefront (active=true) when the card can be shown. */
  publish?: boolean;
  /** New Russian title (only when the rename is accepted). */
  title?: string;
  /** uk/en of the FINAL Russian texts (title, description, condition note). */
  translations?: Partial<Record<"uk" | "en", CardTextTranslations>>;
}

export interface CardTextTranslations {
  title?: string;
  description?: string;
  conditionNote?: string;
}

export interface CardImportRequest {
  items: CardImportItem[];
  replaceSpecs: boolean;
}

export interface CardImportResult {
  applied: number;
  rejected: { productId: string; reason: string }[];
  issues: { productId: string; key: string; reason: string }[];
  createdBrands: string[];
  /** Per product (with `publish`): reason = CARD_NOT_READY | PRODUCT_NOT_PUBLISHABLE (+ `missing`). */
  items: CardImportItemResult[];
}

export interface CardImportItemResult {
  productId: string;
  applied: boolean;
  published: boolean;
  reason?: string | null;
  /** What blocks publishing, e.g. ["price", "category"] (when the backend names it). */
  missing?: string[] | null;
  message?: string | null;
  /** Translations saved per language. */
  translated?: { uk: number; en: number } | null;
  /** Translations not overwritten because the admin wrote them by hand. */
  skippedManual?: number;
}

/** Card journal kept by the backend in products.card_meta. */
export interface CardMeta {
  fields?: Record<string, { c?: number; src?: string }>;
  sources?: string[];
  notes?: string;
  model?: string;
  importedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

/** Option as PATCH /api/admin/spec-attributes/{id} takes it (the list replaces the old one). */
export interface SpecOptionWrite {
  value: string;
  labelRu: string;
  labelUk: string;
  labelEn: string;
  aliases?: string;
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : v === true ? 1 : 0);

function listOf<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const k of ["items", "content", "products", "data"]) if (Array.isArray(o[k])) return o[k] as T[];
  }
  return [];
}

function adaptItem(raw: Record<string, unknown>): CardItem {
  const brand = raw.brand ?? raw.brandName ?? (raw.brandRef as { name?: string } | undefined)?.name ?? null;
  return {
    ...(raw as unknown as CardItem),
    brand: typeof brand === "string" ? brand : null,
    categorySlug: (raw.categorySlug as string | undefined) ?? (raw.category as string | undefined) ?? null,
    priceMinor: typeof raw.priceMinor === "number" ? raw.priceMinor : typeof raw.price === "number" ? raw.price : null,
    cardStatus: typeof raw.cardStatus === "string" ? (raw.cardStatus.toUpperCase() as CardStatusCode) : "DRAFT",
    missingRequired: Array.isArray(raw.missingRequired) ? (raw.missingRequired as string[]) : [],
    specs: raw.specs && typeof raw.specs === "object" ? (raw.specs as Record<string, unknown>) : {},
  };
}

function adaptImportResult(raw: unknown): CardImportResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    applied: n(o.applied),
    rejected: listOf(o.rejected),
    issues: listOf(o.issues),
    createdBrands: listOf<string>(o.createdBrands),
    items: listOf<Record<string, unknown>>(o.items).map((x) => ({
      productId: String(x.productId ?? ""),
      applied: x.applied === true || (typeof x.applied === "number" && x.applied > 0),
      published: x.published === true,
      reason: typeof x.reason === "string" ? x.reason : null,
      missing: Array.isArray(x.missing) ? (x.missing as string[]) : null,
      message: typeof x.message === "string" ? x.message : null,
      translated:
        x.translated && typeof x.translated === "object"
          ? { uk: n((x.translated as Record<string, unknown>).uk), en: n((x.translated as Record<string, unknown>).en) }
          : null,
      skippedManual: n(x.skippedManual),
    })),
  };
}

export const cardsApi = {
  async stats(): Promise<CardStats> {
    const o = await apiGet<Record<string, unknown>>("/api/admin/cards/stats");
    const draft = n(o.draft);
    return {
      draft,
      aiFilled: n(o.aiFilled ?? o.ai_filled),
      ready: n(o.ready),
      incomplete: n(o.incomplete),
      unfinished: n(o.unfinished),
    };
  },

  async export(status: CardExportStatus = "all", ids?: string[]): Promise<CardItem[]> {
    const qs = new URLSearchParams({ status });
    if (ids?.length) qs.set("ids", ids.join(","));
    const raw = await apiGet<unknown>(`/api/admin/cards/export?${qs}`);
    return listOf<Record<string, unknown>>(raw).map(adaptItem);
  },

  async import(body: CardImportRequest): Promise<CardImportResult> {
    return adaptImportResult(await apiPut<unknown>("/api/admin/cards/import", body));
  },

  setCardStatus(productId: string, status: CardStatusCode): Promise<unknown> {
    return apiPatch(`/api/admin/products/${productId}/card-status`, { status });
  },

  /** Storefront visibility (PATCH /api/admin/products/{id}/active). */
  setActive(productId: string, active: boolean): Promise<unknown> {
    return apiPatch(`/api/admin/products/${productId}/active`, { active });
  },

  /**
   * Sets the price of a product from the completion modal. PATCH /api/admin/products/{id} is a
   * full upsert for the scalars (description is overwritten, null price = 0), so title and
   * description are sent as they are now; images, variants, stock and catalog fields are kept (null).
   */
  setPrice(item: { id: string; title: string; description?: string | null }, priceMinor: number): Promise<unknown> {
    return apiPatch(`/api/admin/products/${item.id}`, { title: item.title, description: item.description ?? "", priceMinor });
  },

  /** Full multilingual schema (GET /api/admin/catalog/schema), normalized for prompt and check. */
  async schema(): Promise<CardSchema> {
    return normalizeSchema(await apiGet<unknown>("/api/admin/catalog/schema"));
  },

  /** Replaces the option list of an attribute (used by «Добавить опцию в схему»). */
  updateAttributeOptions(attributeId: string, options: SpecOptionWrite[]): Promise<unknown> {
    return apiPatch(`/api/admin/spec-attributes/${attributeId}`, { options });
  },
};
