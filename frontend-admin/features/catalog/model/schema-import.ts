/**
 * Разбор ответа `GET /api/admin/catalog/schema`. В OpenAPI это «объект» (формат импорта схемы:
 * snake_case, характеристики внутри категорий, родитель по slug), поэтому разбор защитный:
 * экран получает одну форму, как бы ни назвали поля.
 */
import type { SpecType } from "@shop/core/catalog";
import type { AdminBrand, AdminCatalogSchema, AdminCategory, AdminSpecAttribute, AdminSpecGroup } from "./types";

// type in caps): these normalisers keep the UI on one shape whatever the exact JSON is.
type Loose = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
function pick(o: Loose, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}
function aliasList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).map((x) => x.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return [];
}

function normCategory(raw: unknown): AdminCategory {
  const o = (raw ?? {}) as Loose;
  return {
    id: str(o.id),
    slug: str(o.slug),
    name: str(pick(o, "name", "name_ru")),
    parentId: strOrNull(o.parentId),
    sortOrder: num(pick(o, "sortOrder", "sort_order")),
    showInMenu: pick(o, "showInMenu", "show_in_menu") !== false,
    artKind: strOrNull(pick(o, "artKind", "art_kind")),
    productCount: num(pick(o, "productCount", "product_count")),
    productCountDirect: num(pick(o, "productCountDirect", "product_count_direct"), num(pick(o, "productCount", "product_count"))),
    seoTitle: strOrNull(o.seoTitle),
    seoDescription: strOrNull(o.seoDescription),
    h1: strOrNull(o.h1),
    introText: strOrNull(o.introText),
  };
}

function normBrand(raw: unknown): AdminBrand {
  const o = (raw ?? {}) as Loose;
  return {
    id: str(o.id),
    name: str(o.name),
    slug: str(o.slug),
    aliases: aliasList(o.aliases),
    website: strOrNull(pick(o, "website", "site", "url")),
    sortOrder: num(o.sortOrder),
    productCount: num(o.productCount),
    logoUrl: strOrNull(o.logoUrl),
    logoMode: o.logoMode === "ORIGINAL" ? "ORIGINAL" : "MONO",
  };
}

const SPEC_TYPES: SpecType[] = ["number", "enum", "multi", "bool", "text"];

function normLabels(x: Loose) {
  return {
    labelRu: str(pick(x, "labelRu", "label_ru", "label")),
    labelUk: str(pick(x, "labelUk", "label_uk")),
    labelEn: str(pick(x, "labelEn", "label_en")),
  };
}

function normBuckets(buckets: unknown): AdminSpecAttribute["buckets"] {
  if (!Array.isArray(buckets)) return null;
  return buckets.map((b) => {
    const x = (b ?? {}) as Loose;
    return { min: numOrNull(x.min), max: numOrNull(x.max), ...normLabels(x) };
  });
}

function normOption(op: unknown, i: number): AdminSpecAttribute["options"][number] {
  const x = (op ?? {}) as Loose;
  return {
      id: strOrNull(x.id) ?? undefined,
      value: str(x.value),
      ...normLabels(x),
      aliases: aliasList(x.aliases),
      sortOrder: num(pick(x, "sortOrder", "sort"), i * 10),
      usedCount: typeof x.usedCount === "number" ? x.usedCount : undefined,
  };
}

function normUnits(o: Loose) {
  const unit = (o.unit && typeof o.unit === "object" ? o.unit : {}) as Loose;
  return {
    unitRu: strOrNull(pick(o, "unitRu") ?? unit.ru ?? (typeof o.unit === "string" ? o.unit : undefined)),
    unitUk: strOrNull(pick(o, "unitUk") ?? unit.uk),
    unitEn: strOrNull(pick(o, "unitEn") ?? unit.en),
  };
}

function normAttribute(raw: unknown): AdminSpecAttribute {
  const o = (raw ?? {}) as Loose;
  const t = str(o.type).toLowerCase() as SpecType;
  const facet = (o.facet && typeof o.facet === "object" ? o.facet : {}) as Loose;
  const buckets = o.buckets ?? facet.buckets;
  const used = pick(o, "usedCount", "productCount");
  return {
    id: str(o.id),
    categoryId: strOrNull(o.categoryId),
    key: str(o.key),
    ...normLabels(o),
    type: SPEC_TYPES.includes(t) ? t : "text",
    ...normUnits(o),
    range: pick(o, "range", "isRange") === true,
    group: str(pick(o, "group", "groupKey")) || "main",
    filterable: o.filterable === true,
    comparable: o.comparable === true,
    required: pick(o, "required", "requiredForReady", "required_for_ready") === true,
    highlight: o.highlight === true,
    sortOrder: num(pick(o, "sortOrder", "sort")),
    buckets: normBuckets(buckets),
    hint: strOrNull(pick(o, "hint", "hintRu", "hint_ru")),
    options: (Array.isArray(o.options) ? o.options : []).map(normOption),
    inherited: o.inherited === true,
    usedCount: typeof used === "number" ? used : undefined,
  };
}

function normGroup(raw: unknown, i = 0): AdminSpecGroup {
  const o = (raw ?? {}) as Loose;
  return { key: str(o.key), ...normLabels(o), sortOrder: num(pick(o, "sortOrder", "sort"), i * 10) };
}


/** Ответ схемы каталога (формат импорта, с id) → вид экрана. */
export function parseCatalogSchema(raw: unknown): AdminCatalogSchema {
  const r = (raw ?? {}) as Loose;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  let attributes = arr(r.attributes).map(normAttribute);
  // A nested answer (attributes inside their categories, globals apart) is flattened.
  if (attributes.length === 0) {
    attributes = [
      ...arr(pick(r, "globalAttributes", "global_attributes")).map((a) => ({ ...normAttribute(a), categoryId: null })),
      ...arr(r.categories).flatMap((c) =>
        arr((c as Loose).attributes).map((a) => ({ ...normAttribute(a), categoryId: str((c as Loose).id) || null }))
      ),
    ];
  }
  // The import format names the parent by slug.
  const rawCats = arr(r.categories) as Loose[];
  const idBySlug = new Map(rawCats.map((c) => [str(c.slug), str(c.id)]));
  return {
    categories: rawCats.map((c) => {
      const n = normCategory(c);
      const parentSlug = typeof c.parent === "string" ? c.parent : null;
      return n.parentId || !parentSlug ? n : { ...n, parentId: idBySlug.get(parentSlug) ?? null };
    }),
    brands: arr(r.brands).map(normBrand),
    groups: arr(r.groups).map((g, i) => normGroup(g, i)),
    attributes,
  };
}
