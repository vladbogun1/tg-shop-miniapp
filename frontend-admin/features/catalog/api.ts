/**
 * Справочник каталога в админке: категории, бренды, характеристики и их группы, схема каталога.
 * Единственное место путей `/api/admin/{categories,brands,spec-attributes,spec-groups,catalog/schema}`.
 * Ответы — типы из OpenAPI (`Schemas[...]`), приведённые к виду экрана (`model/types.ts`).
 * Порядок характеристик/групп/опций на проводе называется `sort`, на экране `sortOrder`: преобразование
 * только здесь (`fromAttributeDto`, `fromGroupDto`, `toAttributeBody`, `toGroupBody`).
 */
import type { Schemas } from "@shop/core/api/schemas";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, uploadFile } from "@/lib/api";
import { asSpecType } from "./model/attributes";
import { parseCatalogSchema } from "./model/schema-import";
import type {
  AdminBrand,
  AdminCatalogSchema,
  AdminCategory,
  AdminSpecAttribute,
  AdminSpecGroup,
  BrandWriteRequest,
  CategoryReorderItem,
  CategoryWriteRequest,
  SpecAttributeWriteRequest,
} from "./model/types";

type CategoryDto = Schemas["AdminCategoryDto"];
type BrandDto = Schemas["AdminBrandDto"];
type AttributeDto = Schemas["AdminSpecAttributeDto"];
type GroupDto = Schemas["AdminSpecGroupDto"];

// ---- ответ → вид экрана -----------------------------------------------------------------

export function fromCategoryDto(d: CategoryDto): AdminCategory {
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    parentId: d.parentId || null,
    sortOrder: d.sortOrder,
    showInMenu: d.showInMenu,
    artKind: d.artKind || null,
    productCount: d.productCount,
    productCountDirect: d.productCountDirect,
    seoTitle: d.seoTitle || null,
    seoDescription: d.seoDescription || null,
    h1: d.h1 || null,
    introText: d.introText || null,
  };
}

export function fromBrandDto(d: BrandDto): AdminBrand {
  return {
    id: d.id,
    name: d.name,
    slug: d.slug,
    aliases: d.aliases,
    website: d.website || null,
    sortOrder: d.sortOrder,
    productCount: d.productCount,
    logoUrl: d.logoUrl || null,
    logoMode: d.logoMode === "ORIGINAL" ? "ORIGINAL" : "MONO",
  };
}

export function fromAttributeDto(d: AttributeDto): AdminSpecAttribute {
  return {
    id: d.id,
    categoryId: d.categoryId || null,
    key: d.key,
    labelRu: d.labelRu,
    labelUk: d.labelUk,
    labelEn: d.labelEn,
    type: asSpecType(d.type),
    unitRu: d.unitRu || null,
    unitUk: d.unitUk || null,
    unitEn: d.unitEn || null,
    range: d.range,
    group: d.group || "main",
    filterable: d.filterable,
    comparable: d.comparable,
    required: d.required,
    highlight: d.highlight,
    sortOrder: d.sort,
    buckets: d.buckets
      ? d.buckets.map(({ min, max, labelRu, labelUk, labelEn }) => ({ min, max, labelRu, labelUk, labelEn }))
      : null,
    hint: d.hint || null,
    options: d.options.map((o) => ({
      value: o.value,
      labelRu: o.labelRu,
      labelUk: o.labelUk,
      labelEn: o.labelEn,
      aliases: o.aliases,
      sortOrder: o.sort,
      usedCount: o.usedCount,
    })),
    inherited: d.inherited,
    usedCount: d.usedCount,
  };
}

export function fromGroupDto(d: GroupDto, i = 0): AdminSpecGroup {
  return { key: d.key, labelRu: d.labelRu, labelUk: d.labelUk, labelEn: d.labelEn, sortOrder: d.sort ?? i * 10 };
}

// ---- вид экрана → тело запроса ----------------------------------------------------------

/** Тело характеристики: бэкенд зовёт порядок `sort` (и у характеристики, и у опций). */
export function toAttributeBody(a: Partial<SpecAttributeWriteRequest>) {
  const { sortOrder, options, ...rest } = a;
  return {
    ...rest,
    ...(sortOrder !== undefined ? { sort: sortOrder } : {}),
    ...(options !== undefined
      ? {
          options: options.map((o) => ({
            value: o.value,
            labelRu: o.labelRu,
            labelUk: o.labelUk,
            labelEn: o.labelEn,
            aliases: o.aliases,
            sort: o.sortOrder,
          })),
        }
      : {}),
  };
}

export function toGroupBody({ sortOrder, ...g }: AdminSpecGroup) {
  return { ...g, sort: sortOrder };
}

// ---- категории ---------------------------------------------------------------------------

export const categoryApi = {
  /** Дерево плоским списком. */
  list: async () => (await apiGet<CategoryDto[]>("/api/admin/categories")).map(fromCategoryDto),
  create: async (body: CategoryWriteRequest) => fromCategoryDto(await apiPost<CategoryDto>("/api/admin/categories", body)),
  update: async (id: string, body: CategoryWriteRequest) =>
    fromCategoryDto(await apiPatch<CategoryDto>(`/api/admin/categories/${id}`, body)),
  /** 409 CATEGORY_HAS_PRODUCTS / CATEGORY_HAS_CHILDREN. */
  remove: (id: string) => apiDelete<void>(`/api/admin/categories/${id}`),
  reorder: (rows: CategoryReorderItem[]) => apiPatch<unknown>("/api/admin/categories/reorder", rows),
};

// ---- бренды ------------------------------------------------------------------------------

export const brandApi = {
  list: async () => (await apiGet<BrandDto[]>("/api/admin/brands")).map(fromBrandDto),
  create: async (body: BrandWriteRequest) => fromBrandDto(await apiPost<BrandDto>("/api/admin/brands", body)),
  update: async (id: string, body: BrandWriteRequest) => fromBrandDto(await apiPatch<BrandDto>(`/api/admin/brands/${id}`, body)),
  /** Логотип (SVG/PNG/WebP) → { key } для logoUrl. */
  uploadLogo: (file: File) => uploadFile("/api/admin/brands/uploads", file),
  /** Товары бренда остаются без бренда. */
  remove: (id: string) => apiDelete<void>(`/api/admin/brands/${id}`),
  /** Товары и алиасы `id` переходят к `targetId`; `id` удаляется. */
  merge: (id: string, targetId: string) => apiPost<unknown>(`/api/admin/brands/${id}/merge-into/${targetId}`),
};

// ---- характеристики ----------------------------------------------------------------------

export const specApi = {
  /** Свои + унаследованные (родители, общие) характеристики категории; без id — общие. */
  attributes: async (categoryId?: string | null) =>
    (
      await apiGet<AttributeDto[]>(`/api/admin/spec-attributes${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ""}`)
    ).map(fromAttributeDto),
  createAttribute: async (body: SpecAttributeWriteRequest) =>
    fromAttributeDto(await apiPost<AttributeDto>("/api/admin/spec-attributes", toAttributeBody(body))),
  /** Опции заменяются целиком; убрать используемую опцию → 409 без `force`. */
  updateAttribute: async (id: string, body: Partial<SpecAttributeWriteRequest>, force = false) =>
    fromAttributeDto(
      await apiPatch<AttributeDto>(`/api/admin/spec-attributes/${id}${force ? "?force=1" : ""}`, toAttributeBody(body))
    ),
  /** Используется → 409 ATTRIBUTE_IN_USE {count}; `force` ещё и убирает ключ из характеристик товаров. */
  removeAttribute: (id: string, force = false) =>
    apiDelete<void>(`/api/admin/spec-attributes/${id}${force ? "?force=1" : ""}`),
  /** Переписывает характеристики товаров с одного значения опции на другое («объединить с…»). */
  renameOption: (id: string, from: string, to: string) =>
    apiPost<unknown>(`/api/admin/spec-attributes/${id}/rename-option`, { from, to }),
  groups: async () => (await apiGet<GroupDto[]>("/api/admin/spec-groups")).map((g, i) => fromGroupDto(g, i)),
  putGroups: async (groups: AdminSpecGroup[]) =>
    (await apiPut<GroupDto[]>("/api/admin/spec-groups", groups.map(toGroupBody))).map((g, i) => fromGroupDto(g, i)),
};

/** Вся схема каталога на всех языках (редактор, мастер, подсказка ИИ). */
export const schemaApi = {
  get: async (): Promise<AdminCatalogSchema> => parseCatalogSchema(await apiGet<unknown>("/api/admin/catalog/schema")),
};
